# backend/services/hardware_service.py
"""
Hardware Detection Service
Detects GPU, VRAM, CPU, RAM and recommends model presets
"""

import os
import logging
import subprocess
import platform
import re
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)

class HardwareService:
    def __init__(self):
        """Initialize hardware detection service"""
        self.system_info = {
            'platform': platform.system(),
            'platform_release': platform.release(),
            'platform_version': platform.version(),
            'architecture': platform.machine(),
            'processor': platform.processor(),
        }
    
    def detect_gpu_info(self) -> Dict[str, Any]:
        """
        Detect GPU information and VRAM
        
        Returns:
            Dictionary with GPU information
        """
        gpu_info = {
            'available': False,
            'count': 0,
            'models': [],
            'vram_total_mb': 0,
            'vram_free_mb': 0,
            'driver_version': 'Unknown'
        }
        
        try:
            # Try to use nvidia-smi for NVIDIA GPUs
            if self._is_linux() or self._is_windows():
                result = subprocess.run(
                    ['nvidia-smi', '--query-gpu=name,memory.total,memory.free,driver_version', 
                     '--format=csv,noheader,nounits'],
                    capture_output=True, text=True, timeout=5
                )
                if result.returncode == 0:
                    lines = result.stdout.strip().split('\n')
                    gpu_info['available'] = True
                    gpu_info['count'] = len(lines)
                    
                    total_vram = 0
                    free_vram = 0
                    
                    for line in lines:
                        if line.strip():
                            parts = [part.strip() for part in line.split(',')]
                            if len(parts) >= 4:
                                name, total_mem, free_mem, driver = parts[0], parts[1], parts[2], parts[3]
                                gpu_info['models'].append(name)
                                gpu_info['driver_version'] = driver
                                
                                try:
                                    total_vram_mb = int(total_mem)
                                    free_vram_mb = int(free_mem)
                                    total_vram += total_vram_mb
                                    free_vram += free_vram_mb
                                except ValueError:
                                    pass  # If we can't parse the numbers
                    
                    gpu_info['vram_total_mb'] = total_vram
                    gpu_info['vram_free_mb'] = free_vram
                    
                    logger.info(f"Detected {gpu_info['count']} NVIDIA GPU(s) via nvidia-smi")
                    return gpu_info
        except (subprocess.TimeoutExpired, FileNotFoundError, Exception) as e:
            logger.debug(f"nvidia-smi not available or failed: {e}")
        
        # Try to use ROCm-smi for AMD GPUs (Linux)
        try:
            if self._is_linux():
                result = subprocess.run(
                    ['rocminfo'], 
                    capture_output=True, text=True, timeout=5
                )
                if result.returncode == 0:
                    # Parse ROCm output - simplified
                    gpu_info['available'] = True
                    gpu_info['count'] = 1  # Simplified
                    gpu_info['models'] = ['AMD GPU (ROCm)']
                    logger.info("Detected AMD GPU via ROCm")
                    return gpu_info
        except (subprocess.TimeoutExpired, FileNotFoundError, Exception) as e:
            logger.debug(f"ROCm detection failed: {e}")
        
        # Try using wmic on Windows for basic GPU info
        try:
            if self._is_windows():
                result = subprocess.run(
                    ['wmic', 'path', 'win32_VideoController', 'get', 'name,adapterram'],
                    capture_output=True, text=True, timeout=5
                )
                if result.returncode == 0:
                    lines = result.stdout.strip().split('\n')[1:]  # Skip header
                    gpu_info['available'] = True
                    gpu_info['count'] = len([l for l in lines if l.strip()])
                    
                    models = []
                    total_vram = 0
                    for line in lines:
                        if line.strip():
                            parts = line.split()
                            if len(parts) >= 2:
                                # Try to extract RAM (last part) and name (everything else)
                                try:
                                    vram_kb = int(parts[-1])
                                    vram_mb = vram_kb // 1024
                                    total_vram += vram_mb
                                    name = ' '.join(parts[:-1])
                                    models.append(name)
                                except (ValueError, IndexError):
                                    # Just take the whole line as name
                                    models.append(line.strip())
                    
                    gpu_info['models'] = models
                    gpu_info['vram_total_mb'] = total_vram
                    logger.info(f"Detected GPU info via WMIC: {gpu_info['count']} GPU(s)")
                    return gpu_info
        except (subprocess.TimeoutExpired, FileNotFoundError, Exception) as e:
            logger.debug(f"WMIC GPU detection failed: {e}")
        
        # If we got here, no GPU detection worked
        logger.info("No dedicated GPU detected or GPU detection tools not available")
        return gpu_info
    
    def detect_cpu_info(self) -> Dict[str, Any]:
        """
        Detect CPU information
        
        Returns:
            Dictionary with CPU information
        """
        cpu_info = {
            'cpu_count': os.cpu_count() or 1,
            'cpu_freq_mhz': 0,
            'cpu_model': 'Unknown',
            'architecture': platform.machine()
        }
        
        try:
            if self._is_linux():
                # Try to get CPU info from /proc/cpuinfo
                if os.path.exists('/proc/cpuinfo'):
                    with open('/proc/cpuinfo', 'r') as f:
                        content = f.read()
                        
                    # Extract model name
                    model_match = re.search(r'model name\s*:\s*(.+)', content)
                    if model_match:
                        cpu_info['cpu_model'] = model_match.group(1).strip()
                    
                    # Extract CPU frequency
                    freq_match = re.search(r'cpu MHz\s*:\s*([0-9.]+)', content)
                    if freq_match:
                        cpu_info['cpu_freq_mhz'] = float(freq_match.group(1))
            
            elif self._is_windows():
                # Use wmic to get CPU info
                result = subprocess.run(
                    ['wmic', 'cpu', 'get', 'name,numberofcores,numberoflogicalprocessors,maxclockspeed'],
                    capture_output=True, text=True, timeout=5
                )
                if result.returncode == 0:
                    lines = result.stdout.strip().split('\n')
                    if len(lines) > 1:
                        # Skip header
                        data_line = lines[1].strip()
                        if data_line:
                            parts = data_line.split()
                            if len(parts) >= 4:
                                try:
                                    # Name might have spaces, so we need to be careful
                                    # Simple approach: last 3 values are cores, logical cores, max speed
                                    max_speed = int(parts[-1])  # in MHz
                                    cpu_info['cpu_freq_mhz'] = max_speed
                                    # The rest is the name (could be multiple words)
                                    cpu_info['cpu_model'] = ' '.join(parts[:-3])
                                except (ValueError, IndexError):
                                    pass
            
            elif self._is_darwin():  # macOS
                # Use sysctl
                try:
                    result = subprocess.run(
                        ['sysctl', '-n', 'machdep.cpu.brand_string'],
                        capture_output=True, text=True, timeout=5
                    )
                    if result.returncode == 0:
                        cpu_info['cpu_model'] = result.stdout.strip()
                    
                    result = subprocess.run(
                        ['sysctl', '-n', 'hw.cpufrequency'],
                        capture_output=True, text=True, timeout=5
                    )
                    if result.returncode == 0:
                        freq_hz = int(result.stdout.strip())
                        cpu_info['cpu_freq_mhz'] = freq_hz // 1000000
                except:
                    pass
                    
        except Exception as e:
            logger.debug(f"Error detecting CPU info: {e}")
        
        logger.info(f"Detected CPU: {cpu_info['cpu_model']} ({cpu_info['cpu_count']} cores)")
        return cpu_info
    
    def detect_memory_info(self) -> Dict[str, Any]:
        """
        Detect RAM information
        
        Returns:
            Dictionary with memory information
        """
        mem_info = {
            'total_gb': 0,
            'available_gb': 0,
            'used_gb': 0
        }
        
        try:
            if self._is_linux():
                # Read from /proc/meminfo
                if os.path.exists('/proc/meminfo'):
                    with open('/proc/meminfo', 'r') as f:
                        content = f.read()
                    
                    mem_total = 0
                    mem_available = 0
                    
                    for line in content.split('\n'):
                        if line.startswith('MemTotal:'):
                            mem_total = int(line.split()[1])  # in kB
                        elif line.startswith('MemAvailable:'):
                            mem_available = int(line.split()[1])  # in kB
                    
                    mem_info['total_gb'] = mem_total // (1024 * 1024)
                    mem_info['available_gb'] = mem_available // (1024 * 1024)
                    mem_info['used_gb'] = mem_info['total_gb'] - mem_info['available_gb']
            
            elif self._is_windows():
                # Use wmic or systeminfo
                try:
                    result = subprocess.run(
                        ['wmic', 'computersystem', 'get', 'totalphysicalmemory'],
                        capture_output=True, text=True, timeout=5
                    )
                    if result.returncode == 0:
                        lines = result.stdout.strip().split('\n')
                        if len(lines) > 1:
                            total_kb = int(lines[1].strip())
                            mem_info['total_gb'] = total_kb // (1024 * 1024)
                except:
                    pass
                
                # Try to get available memory
                try:
                    result = subprocess.run(
                        ['wmic', 'os', 'get', 'FreePhysicalMemory'],
                        capture_output=True, text=True, timeout=5
                    )
                    if result.returncode == 0:
                        lines = result.stdout.strip().split('\n')
                        if len(lines) > 1:
                            free_kb = int(lines[1].strip())
                            mem_info['available_gb'] = free_kb // 1024  # wmic returns in KB
                            mem_info['used_gb'] = mem_info['total_gb'] - mem_info['available_gb']
                except:
                    pass
            
            elif self._is_darwin():  # macOS
                try:
                    result = subprocess.run(
                        ['sysctl', '-n', 'hw.memsize'],
                        capture_output=True, text=True, timeout=5
                    )
                    if result.returncode == 0:
                        total_bytes = int(result.stdout.strip())
                        mem_info['total_gb'] = total_bytes // (1024 * 1024 * 1024)
                    
                    # For available memory on macOS, it's more complex
                    # We'll use a simple approximation or leave it as 0 for now
                except:
                    pass
                    
        except Exception as e:
            logger.debug(f"Error detecting memory info: {e}")
        
        logger.info(f"Detected RAM: {mem_info['total_gb']} GB total, {mem_info['available_gb']} GB available")
        return mem_info
    
    def detect_disk_space(self, path: str = None) -> Dict[str, Any]:
        """
        Detect disk space for a given path (or workspace base)
        
        Args:
            path: Path to check (defaults to workspace base directory)
            
        Returns:
            Dictionary with disk space information
        """
        if path is None:
            path = os.getenv("WORKSPACE_BASE_DIR", "/d/Projects/MediaOS/workspaces")
        
        disk_info = {
            'total_gb': 0,
            'used_gb': 0,
            'free_gb': 0,
            'percent_used': 0.0
        }
        
        try:
            if self._is_windows():
                import ctypes
                free_bytes = ctypes.c_ulonglong(0)
                total_bytes = ctypes.c_ulonglong(0)
                ctypes.windll.kernel32.GetDiskFreeSpaceExW(
                    ctypes.c_wchar_p(path),
                    None,
                    ctypes.pointer(total_bytes),
                    ctypes.pointer(free_bytes)
                )
                disk_info['total_gb'] = total_bytes.value // (1024 ** 3)
                disk_info['free_gb'] = free_bytes.value // (1024 ** 3)
                disk_info['used_gb'] = disk_info['total_gb'] - disk_info['free_gb']
            else:
                # Unix-like systems
                statvfs = os.statvfs(path)
                disk_info['total_gb'] = (statvfs.f_frsize * statvfs.f_blocks) // (1024 ** 3)
                disk_info['free_gb'] = (statvfs.f_frsize * statvfs.f_bavail) // (1024 ** 3)
                disk_info['used_gb'] = (statvfs.f_frsize * (statvfs.f_blocks - statvfs.f_bavail)) // (1024 ** 3)
            
            if disk_info['total_gb'] > 0:
                disk_info['percent_used'] = (disk_info['used_gb'] / disk_info['total_gb']) * 100
                
        except Exception as e:
            logger.debug(f"Error detecting disk space for {path}: {e}")
        
        logger.info(f"Detected disk space at {path}: {disk_info['free_gb']} GB free of {disk_info['total_gb']} GB")
        return disk_info
    
    def get_full_system_info(self) -> Dict[str, Any]:
        """
        Get complete system information
        
        Returns:
            Dictionary with all detected hardware information
        """
        gpu_info = self.detect_gpu_info()
        cpu_info = self.detect_cpu_info()
        mem_info = self.detect_memory_info()
        disk_info = self.detect_disk_space()
        
        return {
            'platform': self.system_info,
            'gpu': gpu_info,
            'cpu': cpu_info,
            'memory': mem_info,
            'disk': disk_info
        }
    
    def recommend_model_presets(self) -> Dict[str, Any]:
        """
        Recommend model presets based on detected hardware
        
        Returns:
            Dictionary with recommended presets for different components
        """
        gpu_info = self.detect_gpu_info()
        vram_mb = gpu_info.get('vram_total_mb', 0)
        
        # Default presets (safe for CPU/low-end)
        presets = {
            'flux': {
                'model': 'blackforestlabs/FLUX.1-schnell',
                'variant': None,
                'reason': 'VRAM < 6GB or no GPU detected - using Schnell for speed'
            },
            'liveportrait': {
                'model': 'liveportrait/base',
                'resolution': '256x256',
                'reason': 'VRAM < 6GB or no GPU detected - using lower resolution'
            },
            'musicgen': {
                'model': 'facebook/musicgen-small',
                'duration': 30,
                'reason': 'VRAM < 6GB or no GPU detected - using small model'
            },
            'llm': {
                'model': 'microsoft/phi-2',
                'reason': 'VRAM < 6GB or no GPU detected - using small LLM'
            }
        }
        
        # Adjust based on VRAM
        if vram_mb >= 12288:  # 12GB+
            presets['flux'] = {
                'model': 'blackforestlabs/FLUX.1-dev',
                'variant': None,
                'reason': 'VRAM >= 12GB - using Flux Dev for highest quality'
            }
            presets['liveportrait'] = {
                'model': 'liveportrait/base',
                'resolution': '512x512',
                'reason': 'VRAM >= 12GB - using higher resolution'
            }
            presets['musicgen'] = {
                'model': 'facebook/musicgen-large',
                'duration': 30,
                'reason': 'VRAM >= 12GB - using large model for better quality'
            }
            presets['llm'] = {
                'model': 'TheBloke/Llama-2-13B-chat-GGUF',
                'reason': 'VRAM >= 12GB - using larger LLM'
            }
        elif vram_mb >= 6144:  # 6-12GB
            presets['flux'] = {
                'model': 'blackforestlabs/FLUX.1-schnell',
                'variant': None,
                'reason': 'VRAM 6-12GB - using Schnell for balance of speed/quality'
            }
            presets['liveportrait'] = {
                'model': 'liveportrait/base',
                'resolution': '384x384',
                'reason': 'VRAM 6-12GB - using medium resolution'
            }
            presets['musicgen'] = {
                'model': 'facebook/musicgen-medium',
                'duration': 30,
                'reason': 'VRAM 6-12GB - using medium model'
            }
            presets['llm'] = {
                'model': 'TheBloke/Llama-2-7B-chat-GGUF',
                'reason': 'VRAM 6-12GB - using medium LLM'
            }
        else:  # < 6GB VRAM or no GPU
            # Already set to defaults above, but let's be explicit
            presets['flux'] = {
                'model': 'blackforestlabs/FLUX.1-schnell',
                'variant': None,
                'reason': 'VRAM < 6GB or no GPU - using Schnell for speed'
            }
            presets['liveportrait'] = {
                'model': 'liveportrait/base',
                'resolution': '256x256',
                'reason': 'VRAM < 6GB or no GPU - using lower resolution'
            }
            presets['musicgen'] = {
                'model': 'facebook/musicgen-small',
                'duration': 30,
                'reason': 'VRAM < 6GB or no GPU - using small model'
            }
            presets['llm'] = {
                'model': 'microsoft/phi-2',
                'reason': 'VRAM < 6GB or no GPU - using small LLM'
            }
        
        # Add overall recommendation
        presets['recommendation'] = {
            'gpu_detected': gpu_info.get('available', False),
            'gpu_vram_mb': vram_mb,
            'gpu_model': gpu_info.get('models', ['None'])[0] if gpu_info.get('models') else 'None',
            'suggested_setup': 'GPU Accelerated' if gpu_info.get('available') and vram_mb >= 6144 else 'CPU Fallback'
        }
        
        logger.info(f"Generated model presets based on {vram_mb}MB VRAM")
        return presets
    
    def _is_windows(self) -> bool:
        """Check if running on Windows"""
        return platform.system() == 'Windows'
    
    def _is_linux(self) -> bool:
        """Check if running on Linux"""
        return platform.system() == 'Linux'
    
    def _is_darwin(self) -> bool:
        """Check if running on macOS"""
        return platform.system() == 'Darwin'

# Global instance
hardware_service = HardwareService()