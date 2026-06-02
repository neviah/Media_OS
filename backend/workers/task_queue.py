# backend/workers/task_queue.py
"""
Task Queue System using Redis and RQ
Handles background job processing for pipelines
"""

import redis
from rq import Queue, Worker
from rq.job import Job
import logging
import os
from typing import Any, Callable

logger = logging.getLogger(__name__)

class TaskQueue:
    def __init__(self, redis_url: str = None):
        """
        Initialize task queue
        
        Args:
            redis_url: Redis connection URL (defaults to localhost:6379)
        """
        self.redis_url = redis_url or os.getenv("REDIS_URL", "redis://localhost:6379")
        try:
            self.redis_conn = redis.from_url(self.redis_url)
            # Test connection
            self.redis_conn.ping()
            logger.info(f"Connected to Redis at {self.redis_url}")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            raise
        
        # Initialize queues for different priority levels
        self.high_priority_queue = Queue('high', connection=self.redis_conn)
        self.default_queue = Queue('default', connection=self.redis_conn)
        self.low_priority_queue = Queue('low', connection=self.redis_conn)
    
    def enqueue(self, func: Callable, *args, 
               queue_name: str = 'default', 
               job_timeout: str = '10m',
               result_ttl: int = 86400,  # 24 hours
               failure_ttl: int = 86400,  # 24 hours
               **kwargs) -> Job:
        """
        Enqueue a function to be executed by a worker
        
        Args:
            func: Function to execute
            *args: Arguments to pass to function
            queue_name: Queue name ('high', 'default', 'low')
            job_timeout: Maximum job execution time
            result_ttl: Time to keep successful job results (seconds)
            failure_ttl: Time to keep failed job results (seconds)
            **kwargs: Keyword arguments to pass to function
            
        Returns:
            RQ Job object
        """
        queue_map = {
            'high': self.high_priority_queue,
            'default': self.default_queue,
            'low': self.low_priority_queue
        }
        
        queue = queue_map.get(queue_name, self.default_queue)
        
        try:
            job = queue.enqueue(
                func, 
                *args,
                job_timeout=job_timeout,
                result_ttl=result_ttl,
                failure_ttl=failure_ttl,
                **kwargs
            )
            logger.info(f"Enqueued job {job.id} to {queue_name} queue")
            return job
        except Exception as e:
            logger.error(f"Failed to enqueue job: {e}")
            raise
    
    def get_job(self, job_id: str) -> Job:
        """
        Get a job by its ID
        
        Args:
            job_id: ID of the job
            
        Returns:
            RQ Job object
        """
        try:
            job = Job.fetch(job_id, connection=self.redis_conn)
            return job
        except Exception as e:
            logger.error(f"Failed to fetch job {job_id}: {e}")
            raise
    
    def get_queue_stats(self) -> dict:
        """
        Get statistics for all queues
        
        Returns:
            Dictionary with queue statistics
        """
        try:
            stats = {}
            for name, queue in [('high', self.high_priority_queue), 
                               ('default', self.default_queue),
                               ('low', self.low_priority_queue)]:
                stats[name] = {
                    'count': queue.count,
                    'failed_count': queue.failed_count,
                    'jobs': [job.id for job in queue.jobs]
                }
            return stats
        except Exception as e:
            logger.error(f"Failed to get queue stats: {e}")
            return {}

# Global task queue instance
task_queue = TaskQueue()

# Worker functions that can be enqueued
def run_news_to_script_pipeline(workspace_id: int, channel_id: int, 
                               news_source_id: int = None):
    """Worker function for news to script pipeline"""
    from backend.pipelines.news_to_script import news_to_script_pipeline
    return news_to_script_pipeline.process_news_to_script(
        workspace_id, channel_id, news_source_id
    )

def run_script_to_voice_pipeline(script_id: int):
    """Worker function for script to voice pipeline"""
    from backend.pipelines.script_to_voice import script_to_voice_pipeline
    return script_to_voice_pipeline.process_script_to_voice(script_id)

def run_voice_to_avatar_video_pipeline(audio_id: int):
    """Worker function for voice to avatar video pipeline"""
    from backend.pipelines.voice_to_avatar_video import voice_to_avatar_video_pipeline
    return voice_to_avatar_video_pipeline.process_voice_to_avatar_video(audio_id)

def run_video_assembly_pipeline(video_id: int, 
                               music_id: int = None,
                               b_roll_prompts: list = None):
    """Worker function for video assembly pipeline"""
    from backend.pipelines.video_assembly import video_assembly_pipeline
    return video_assembly_pipeline.process_video_assembly(
        video_id, music_id, b_roll_prompts
    )

def run_publishing_pipeline(video_id: int, platform: str):
    """Worker function for publishing pipeline"""
    from backend.pipelines.publishing import publishing_pipeline
    return publishing_pipeline.publish_video(video_id, platform)

def run_metrics_pipeline(video_id: int, platform: str):
    """Worker function for metrics pipeline"""
    from backend.pipelines.metrics import metrics_pipeline
    return metrics_pipeline.collect_metrics(video_id, platform)

# Function to start workers (would be called separately)
def start_workers(queue_names: list = ['high', 'default', 'low']):
    """
    Start RQ workers to process queued jobs
    
    Args:
        queue_names: List of queue names to listen to
    """
    try:
        queues = []
        queue_map = {
            'high': task_queue.high_priority_queue,
            'default': task_queue.default_queue,
            'low': task_queue.low_priority_queue
        }
        
        for name in queue_names:
            if name in queue_map:
                queues.append(queue_map[name])
        
        if not queues:
            logger.error("No valid queues specified")
            return
        
        logger.info(f"Starting workers for queues: {queue_names}")
        worker = Worker(queues, connection=task_queue.redis_conn)
        worker.work()
    except Exception as e:
        logger.error(f"Failed to start workers: {e}")
        raise