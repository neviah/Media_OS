# backend/workers/gpu_scheduler.py
"""
GPU Job Scheduler
Manages GPU resource allocation for AI/ML model inference jobs
"""

import logging
import threading
import time
import uuid
from enum import Enum
from typing import Optional, Dict, Any, Callable
from dataclasses import dataclass, field
from queue import PriorityQueue
import heapq

logger = logging.getLogger(__name__)

class GPUJobPriority(Enum):
    """Priority levels for GPU jobs"""
    LOW = 1
    NORMAL = 2
    HIGH = 3
    CRITICAL = 4

@dataclass
class GPUJob:
    """Represents a GPU job to be scheduled"""
    id: str
    func: Callable
    args: tuple
    kwargs: dict
    priority: GPUJobPriority
    gpu_memory_required: int  # in MB
    estimated_duration: float  # in seconds
    submitted_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    result: Any = None
    exception: Optional[Exception] = None
    status: str = "queued"  # queued, running, completed, failed
    
    def __lt__(self, other):
        # For priority queue: higher priority value = higher priority
        # If same priority, earlier submission time = higher priority
        if self.priority.value != other.priority.value:
            return self.priority.value > other.priority.value
        return self.submitted_at < other.submitted_at

class GPUScheduler:
    def __init__(self, total_gpu_memory: int = 8192):  # 8GB default
        """
        Initialize GPU scheduler
        
        Args:
            total_gpu_memory: Total GPU memory available in MB
        """
        self.total_gpu_memory = total_gpu_memory
        self.allocated_memory = 0
        self.available_memory = total_gpu_memory
        
        # Job queues
        self.job_queue = PriorityQueue()
        self.running_jobs: Dict[str, GPUJob] = {}
        self.completed_jobs: Dict[str, GPUJob] = {}
        
        # Threading
        self.scheduler_thread = None
        self.stop_event = threading.Event()
        self.lock = threading.Lock()
        
        logger.info(f"GPU Scheduler initialized with {total_gpu_memory}MB memory")
    
    def start(self):
        """Start the GPU scheduler thread"""
        if self.scheduler_thread is None or not self.scheduler_thread.is_alive():
            self.stop_event.clear()
            self.scheduler_thread = threading.Thread(target=self._scheduler_loop, daemon=True)
            self.scheduler_thread.start()
            logger.info("GPU scheduler started")
    
    def stop(self):
        """Stop the GPU scheduler thread"""
        self.stop_event.set()
        if self.scheduler_thread and self.scheduler_thread.is_alive():
            self.scheduler_thread.join(timeout=5)
        logger.info("GPU scheduler stopped")
    
    def submit_job(self, func: Callable, *args,
                  priority: GPUJobPriority = GPUJobPriority.NORMAL,
                  gpu_memory_required: int = 1024,  # 1GB default
                  estimated_duration: float = 30.0,   # 30 seconds default
                  **kwargs) -> str:
        """
        Submit a job to the GPU scheduler
        
        Args:
            func: Function to execute on GPU
            *args: Arguments to pass to function
            priority: Job priority level
            gpu_memory_required: GPU memory required in MB
            estimated_duration: Estimated job duration in seconds
            **kwargs: Keyword arguments to pass to function
            
        Returns:
            Job ID string
        """
        job_id = str(uuid.uuid4())
        
        job = GPUJob(
            id=job_id,
            func=func,
            args=args,
            kwargs=kwargs,
            priority=priority,
            gpu_memory_required=gpu_memory_required,
            estimated_duration=estimated_duration
        )
        
        with self.lock:
            self.job_queue.put(job)
            logger.info(f"Submitted GPU job {job_id} with priority {priority.name}, "
                       f"requiring {gpu_memory_required}MB RAM")
        
        return job_id
    
    def get_job_status(self, job_id: str) -> Optional[Dict[str, Any]]:
        """
        Get the status of a job
        
        Args:
            job_id: ID of the job to check
            
        Returns:
            Dictionary with job status information or None if not found
        """
        with self.lock:
            # Check running jobs
            if job_id in self.running_jobs:
                job = self.running_jobs[job_id]
                return {
                    "id": job.id,
                    "status": job.status,
                    "progress": self._calculate_progress(job),
                    "gpu_memory_used": job.gpu_memory_required
                }
            
            # Check queued jobs (need to search through queue)
            # Note: This is inefficient but okay for stub
            temp_queue = PriorityQueue()
            found_job = None
            
            while not self.job_queue.empty():
                job = self.job_queue.get()
                if job.id == job_id:
                    found_job = job
                temp_queue.put(job)
            
            # Restore queue
            while not temp_queue.empty():
                self.job_queue.put(temp_queue.get())
            
            if found_job:
                return {
                    "id": found_job.id,
                    "status": found_job.status,
                    "position_in_queue": self._get_queue_position(job_id),
                    "gpu_memory_required": found_job.gpu_memory_required
                }
            
            # Check completed jobs
            if job_id in self.completed_jobs:
                job = self.completed_jobs[job_id]
                return {
                    "id": job.id,
                    "status": job.status,
                    "result": job.result,
                    "exception": str(job.exception) if job.exception else None,
                    "runtime": job.completed_at - job.started_at if job.started_at and job.completed_at else None
                }
            
            return None
    
    def _scheduler_loop(self):
        """Main scheduler loop"""
        logger.info("GPU scheduler loop started")
        
        while not self.stop_event.is_set():
            try:
                self._allocate_resources()
                self._cleanup_completed_jobs()
                time.sleep(1)  # Check every second
            except Exception as e:
                logger.error(f"Error in GPU scheduler loop: {e}")
                time.sleep(5)  # Back off on error
    
    def _allocate_resources(self):
        """Allocate GPU resources to queued jobs"""
        with self.lock:
            # Try to start jobs from the queue while we have resources
            while not self.job_queue.empty() and self.available_memory > 0:
                # Peek at the highest priority job
                # Note: PriorityQueue doesn't support peek, so we get and put back if we can't run
                try:
                    job = self.job_queue.get_nowait()
                except:
                    break  # Queue is empty
                
                # Check if we have enough memory for this job
                if job.gpu_memory_required <= self.available_memory:
                    # Allocate resources and start job
                    self.allocated_memory += job.gpu_memory_required
                    self.available_memory -= job.gpu_memory_required
                    job.status = "running"
                    job.started_at = time.time()
                    self.running_jobs[job.id] = job
                    
                    # Execute job in a separate thread
                    job_thread = threading.Thread(
                        target=self._execute_job,
                        args=(job,),
                        daemon=True
                    )
                    job_thread.start()
                    
                    logger.info(f"Started GPU job {job.id} "
                               f"(using {job.gpu_memory_required}MB, "
                               f"{self.available_memory}MB available)")
                else:
                    # Not enough memory, put job back and break
                    self.job_queue.put(job)
                    break
    
    def _execute_job(self, job: GPUJob):
        """Execute a single GPU job"""
        try:
            logger.info(f"Executing GPU job {job.id}")
            # In a real implementation, we would:
            # 1. Set up GPU context (CUDA context, etc.)
            # 2. Ensure the function has access to GPU resources
            # 3. Execute the function
            
            # For stub, we just call the function directly
            # Note: In reality, GPU jobs would need proper context management
            result = job.func(*job.args, **job.kwargs)
            
            job.result = result
            job.status = "completed"
            job.completed_at = time.time()
            
            logger.info(f"Completed GPU job {job.id} "
                       f"in {job.completed_at - job.started_at:.2f}s")
            
        except Exception as e:
            logger.error(f"GPU job {job.id} failed: {e}")
            job.exception = e
            job.status = "failed"
            job.completed_at = time.time()
        
        finally:
            # Release GPU resources
            with self.lock:
                if job.id in self.running_jobs:
                    del self.running_jobs[job.id]
                self.allocated_memory -= job.gpu_memory_required
                self.available_memory += job.gpu_memory_required
                
                # Move to completed jobs
                self.completed_jobs[job.id] = job
    
    def _cleanup_completed_jobs(self):
        """Remove old completed jobs to prevent memory buildup"""
        with self.lock:
            current_time = time.time()
            # Remove jobs older than 1 hour
            to_remove = []
            for job_id, job in self.completed_jobs.items():
                if job.completed_at and (current_time - job.completed_at) > 3600:
                    to_remove.append(job_id)
            
            for job_id in to_remove:
                del self.completed_jobs[job_id]
                logger.debug(f"Cleaned up completed job {job_id}")
    
    def _calculate_progress(self, job: GPUJob) -> float:
        """Calculate job progress as a percentage (0-100)"""
        if job.status == "queued":
            return 0.0
        elif job.status == "running":
            if job.started_at:
                elapsed = time.time() - job.started_at
                # Simple linear progress based on estimated duration
                progress = min(95.0, (elapsed / job.estimated_duration) * 100)
                return progress
            return 50.0  # Unknown progress
        elif job.status in ["completed", "failed"]:
            return 100.0
        return 0.0
    
    def _get_queue_position(self, job_id: str) -> int:
        """Get approximate position of job in queue (1-based)"""
        # Note: This is inefficient but okay for stub
        temp_queue = PriorityQueue()
        position = 0
        found = False
        
        # Copy queue to temp and count
        while not self.job_queue.empty():
            job = self.job_queue.get()
            position += 1
            if job.id == job_id:
                found = True
                break
            temp_queue.put(job)
        
        # Put back any remaining jobs
        while not self.job_queue.empty():
            temp_queue.put(self.job_queue.get())
        
        # Restore original queue
        while not temp_queue.empty():
            self.job_queue.put(temp_queue.get())
        
        return position if found else -1

# Global GPU scheduler instance
gpu_scheduler = GPUScheduler()