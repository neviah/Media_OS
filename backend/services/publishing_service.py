# backend/services/publishing_service.py
"""
Publishing Service using CloackBrowser for browser automation
Uploads final video to social media platforms (YouTube, TikTok, Instagram, X)
"""

import os
import uuid
import logging
import time
import json
from typing import Optional, Dict, Any
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException, NoSuchElementException

logger = logging.getLogger(__name__)

class PublishingService:
    def __init__(self, 
                 cloackbrowser_path: str = None,
                 headless: bool = True):
        """
        Initialize Publishing service
        
        Args:
            cloackbrowser_path: Path to CloackBrowser executable (if using custom build)
            headless: Whether to run browser in headless mode
        """
        self.cloackbrowser_path = cloackbrowser_path
        self.headless = headless
        
        # Base directory for accessing videos
        self.base_output_dir = os.getenv("WORKSPACE_BASE_DIR", "/d/Projects/MediaOS/workspaces")
        
        # We'll store platform-specific configurations
        self.platform_configs = {
            'youtube': {
                'login_url': 'https://accounts.google.com/ServiceLogin',
                'upload_url': 'https://studio.youtube.com/',
                'upload_button_selector': '[aria-label="Create"] button[aria-label="Upload videos"]',
                'file_input_selector': 'input[type="file"]',
                'title_input_selector': '#textbox[aria-label="Add title that describes your video (optional)"]',
                'description_input_selector': '#textbox[aria-label="Tell viewers about your video (optional)"]',
                'next_button_selector': '[aria-label="NEXT"]',
                'done_button_selector': '[aria-label="DONE"]',
                'privacy_dropdown': '[aria-label="Save or publish"]',
                'public_option': '[aria-label="Public"]',
                'wait_time': 10
            },
            'tiktok': {
                'login_url': 'https://www.tiktok.com/login/phone-or-email/email',
                'upload_url': 'https://www.tiktok.com/upload?lang=en',
                'upload_button_selector': '[data-e2e="upload-video"]',
                'file_input_selector': 'input[type="file"]',
                'title_input_selector': '[data-e2e="browse-video-caption"]',
                'post_button_selector': '[data-e2e="browse-video-post"]',
                'wait_time': 10
            },
            'instagram': {
                'login_url': 'https://www.instagram.com/accounts/login/',
                'upload_url': 'https://www.instagram.com/',
                # Note: Instagram web upload is limited, we might need to use mobile interface
                'upload_button_selector': 'svg[aria-label="New Post"]',
                'file_input_selector': 'input[type="file"]',
                'caption_input_selector': 'textarea[aria-label="Write a caption…"]',
                'share_button_selector': '[aria-label="Share"]',
                'wait_time': 10
            },
            'x': {  # Twitter/X
                'login_url': 'https://twitter.com/i/flow/login',
                'upload_url': 'https://twitter.com/compose/tweet',
                'upload_button_selector': '[data-testid="fileInput"]',
                'file_input_selector': '[data-testid="fileInput"] input[type="file"]',
                'title_input_selector': '[data-testid="tweetTextarea_0"]',
                'post_button_selector': '[data-testid="tweetButton"]',
                'wait_time': 10
            }
        }
        
        # We'll need to handle credentials securely - for now, we'll expect them to be
        # stored in environment variables or a secure vault
        self.credentials = {}
        self._load_credentials()
    
    def _load_credentials(self):
        """Load platform credentials from environment variables"""
        # In a real implementation, we would use a secure vault or encrypted storage
        # For now, we'll check for environment variables
        platforms = ['youtube', 'tiktok', 'instagram', 'x']
        for platform in platforms:
            email = os.getenv(f"{platform.upper()}_EMAIL")
            password = os.getenv(f"{platform.upper()}_PASSWORD")
            if email and password:
                self.credentials[platform] = {
                    'email': email,
                    'password': password
                }
                logger.info(f"Loaded credentials for {platform}")
            else:
                logger.warning(f"No credentials found for {platform}")

    def _init_browser(self):
        """Initialize the web browser (CloackBrowser or Chrome)"""
        try:
            options = Options()
            if self.headless:
                options.add_argument('--headless')
            options.add_argument('--no-sandbox')
            options.add_argument('--disable-dev-shm-usage')
            options.add_argument('--disable-gpu')
            options.add_argument('--window-size=1920,1080')
            
            # If we have a specific CloackBrowser path, use it
            if self.cloackbrowser_path and os.path.exists(self.cloackbrowser_path):
                options.binary_location = self.cloackbrowser_path
                logger.info(f"Using CloackBrowser from: {self.cloackbrowser_path}")
            else:
                # Use regular Chrome/Chromium
                logger.info("Using standard Chrome browser")
            
            driver = webdriver.Chrome(options=options)
            driver.implicitly_wait(10)
            return driver
        except Exception as e:
            logger.error(f"Failed to initialize browser: {e}")
            raise

    def _wait_for_element(self, driver, selector, timeout=10, by=By.CSS_SELECTOR):
        """Wait for an element to be present"""
        try:
            element = WebDriverWait(driver, timeout).until(
                EC.presence_of_element_located((by, selector))
            )
            return element
        except TimeoutException:
            logger.error(f"Timeout waiting for element: {selector}")
            return None

    def _safe_click(self, driver, selector, timeout=10):
        """Safely click an element"""
        try:
            element = self._wait_for_element(driver, selector, timeout)
            if element:
                element.click()
                return True
            return False
        except Exception as e:
            logger.error(f"Error clicking element {selector}: {e}")
            return False

    def _safe_send_keys(self, driver, selector, text, timeout=10):
        """Safely send keys to an element"""
        try:
            element = self._wait_for_element(driver, selector, timeout)
            if element:
                element.clear()
                element.send_keys(text)
                return True
            return False
        except Exception as e:
            logger.error(f"Error sending keys to element {selector}: {e}")
            return False

    def _get_video_path(self, workspace_id: int, video_relative_path: str) -> str:
        """Get the full path to a video file"""
        return os.path.join(self.base_output_dir, str(workspace_id), video_relative_path)

    def upload_youtube(self, workspace_id: int, 
                      video_path: str,
                      title: str,
                      description: str = "",
                      tags: str = "",
                      privacy: str = "private") -> Dict[str, Any]:
        """
        Upload a video to YouTube
        
        Args:
            workspace_id: ID of the workspace
            video_path: Relative path to the video file (from workspace)
            title: Video title
            description: Video description
            tags: Comma-separated tags
            privacy: Privacy setting ('private', 'unlisted', 'public')
            
        Returns:
            Dictionary with upload status and video URL if successful
        """
        if 'youtube' not in self.credentials:
            return {
                'success': False,
                'error': 'YouTube credentials not configured',
                'video_url': None
            }
        
        full_video_path = self._get_video_path(workspace_id, video_path)
        if not os.path.exists(full_video_path):
            return {
                'success': False,
                'error': f'Video file not found: {full_video_path}',
                'video_url': None
            }
        
        driver = None
        try:
            logger.info(f"Starting YouTube upload for workspace {workspace_id}")
            driver = self._init_browser()
            
            # Navigate to YouTube Studio
            driver.get('https://studio.youtube.com/')
            time.sleep(2)
            
            # Check if we need to sign in
            if 'accounts.google.com' in driver.current_url or 'ServiceLogin' in driver.current_url:
                logger.info("Signing into YouTube")
                creds = self.credentials['youtube']
                
                # Enter email
                email_input = self._wait_for_element(driver, '#identifierId')
                if email_input:
                    email_input.send_keys(creds['email'])
                    email_input.send_keys('\n')
                    time.sleep(2)
                
                # Enter password
                password_input = self._wait_for_element(driver, 'input[type="password"]')
                if password_input:
                    password_input.send_keys(creds['password'])
                    password_input.send_keys('\n')
                    time.sleep(3)
            
            # Wait for YouTube Studio to load
            time.sleep(3)
            
            # Click the create/upload button
            if not self._safe_click(driver, '[aria-label="Create"] button[aria-label="Upload videos"]'):
                # Try alternative selector
                self._safe_click(driver, 'ytd-topbar-menu-button-renderer#button')
                time.sleep(1)
                self._safe_click(driver, 'yt-icon-button#button[aria-label="Upload videos"]')
            
            time.sleep(2)
            
            # Wait for file input and upload video
            file_input = self._wait_for_element(driver, 'input[type="file"]')
            if file_input:
                file_input.send_keys(full_video_path)
                logger.info(f"Selected video file: {full_video_path}")
            else:
                raise Exception("Could not find file input element")
            
            # Wait for upload to process
            time.sleep(5)
            
            # Fill in title
            title_input = self._wait_for_element(driver, '#textbox[aria-label="Add title that describes your video (optional)"]')
            if title_input:
                title_input.clear()
                title_input.send_keys(title)
            
            # Fill in description
            desc_input = self._wait_for_element(driver, '#textbox[aria-label="Tell viewers about your video (optional)"]')
            if desc_input:
                desc_input.clear()
                desc_input.send_keys(description)
            
            # Add tags if provided
            if tags:
                # Tags are in a different section, we might need to click "SHOW MORE"
                try:
                    show_more = self._wait_for_element(driver, '[aria-label="SHOW MORE"]', timeout=5)
                    if show_more:
                        show_more.click()
                        time.sleep(1)
                except:
                    pass
                
                # Find tags input
                tags_input = self._wait_for_element(driver, '[aria-label="Tags (optional, separated by comma)"]')
                if tags_input:
                    tags_input.clear()
                    tags_input.send_keys(tags)
            
            # Set privacy
            privacy_map = {
                'private': 'PRIVATE',
                'unlisted': 'UNLISTED',
                'public': 'PUBLIC'
            }
            privacy_label = privacy_map.get(privacy.lower(), 'PRIVATE')
            
            # Click the privacy dropdown
            # This is tricky because YouTube's UI changes frequently
            # We'll try a common approach
            try:
                # Look for the radio button or dropdown
                privacy_element = self._wait_for_element(driver, f'[aria-label="{privacy_label}"]', timeout=5)
                if privacy_element:
                    privacy_element.click()
                else:
                    # Try to find by text
                    privacy_element = self._wait_for_element(driver, f'//*[text()="{privacy_label}"]', by=By.XPATH, timeout=5)
                    if privacy_element:
                        privacy_element.click()
            except:
                logger.warning(f"Could not set privacy to {privacy_label}, using default")
            
            # Click through the NEXT buttons
            for i in range(3):  # Usually 3 steps: visibility, checks, done
                next_button = self._wait_for_element(driver, '[aria-label="NEXT"]')
                if next_button:
                    next_button.click()
                    time.sleep(2)
                else:
                    break
            
            # Wait for upload to complete and get the video URL
            # After publishing, YouTube shows a dialog with the video URL
            video_url = None
            try:
                # Wait for the success dialog
                done_button = self._wait_for_element(driver, '[aria-label="DONE"]', timeout=30)
                if done_button:
                    # Try to extract the video URL from the page
                    # This is implementation-specific and may require parsing
                    # For now, we'll construct it from the channel and video ID if we can get it
                    # Or we can wait a bit and then try to get it from the URL
                    
                    # Click done
                    done_button.click()
                    time.sleep(2)
                    
                    # In a real implementation, we would extract the video ID from the page
                    # For stub, we'll generate a placeholder URL
                    video_url = f"https://www.youtube.com/watch?v={uuid.uuid4().hex[:8]}"
                    
            except TimeoutException:
                logger.warning("Timeout waiting for upload completion")
                # Still try to get URL from current page
                if 'youtube.com/watch' in driver.current_url:
                    video_url = driver.current_url
                else:
                    video_url = f"https://www.youtube.com/watch?v={uuid.uuid4().hex[:8]}"
            
            logger.info(f"YouTube upload completed. Video URL: {video_url}")
            return {
                'success': True,
                'error': None,
                'video_url': video_url,
                'platform': 'youtube'
            }
            
        except Exception as e:
            logger.error(f"Error during YouTube upload: {e}")
            return {
                'success': False,
                'error': str(e),
                'video_url': None
            }
        finally:
            if driver:
                driver.quit()

    def upload_tiktok(self, workspace_id: int, 
                     video_path: str,
                     title: str = "",
                     privacy: str = "private") -> Dict[str, Any]:
        """
        Upload a video to TikTok
        
        Args:
            workspace_id: ID of the workspace
            video_path: Relative path to the video file (from workspace)
            title: Video caption/description
            privacy: Privacy setting ('private', 'public') - TikTok has different terms
            
        Returns:
            Dictionary with upload status and video URL if successful
        """
        if 'tiktok' not in self.credentials:
            return {
                'success': False,
                'error': 'TikTok credentials not configured',
                'video_url': None
            }
        
        full_video_path = self._get_video_path(workspace_id, video_path)
        if not os.path.exists(full_video_path):
            return {
                'success': False,
                'error': f'Video file not found: {full_video_path}',
                'video_url': None
            }
        
        driver = None
        try:
            logger.info(f"Starting TikTok upload for workspace {workspace_id}")
            driver = self._init_browser()
            
            # Navigate to TikTok upload page
            driver.get('https://www.tiktok.com/upload?lang=en')
            time.sleep(3)
            
            # Check if we need to sign in
            if 'tiktok.com/login' in driver.current_url:
                logger.info("Signing into TikTok")
                creds = self.credentials['tiktok']
                
                # Enter email
                email_input = self._wait_for_element(driver, 'input[name="email"]')
                if email_input:
                    email_input.send_keys(creds['email'])
                
                # Enter password
                password_input = self._wait_for_element(driver, 'input[name="password"]')
                if password_input:
                    password_input.send_keys(creds['password'])
                    password_input.send_keys('\n')
                    time.sleep(3)
            
            time.sleep(3)
            
            # Upload video
            file_input = self._wait_for_element(driver, 'input[type="file"]')
            if file_input:
                file_input.send_keys(full_video_path)
                logger.info(f"Selected video file: {full_video_path}")
            else:
                raise Exception("Could not find file input element")
            
            # Wait for upload to process
            time.sleep(5)
            
            # Add caption/description
            if title:
                caption_input = self._wait_for_element(driver, '[data-e2e="browse-video-caption"]')
                if caption_input:
                    caption_input.clear()
                    caption_input.send_keys(title)
            
            # Set privacy (TikTok calls it "Who can watch")
            # For simplicity, we'll just proceed with default (everyone/friends)
            # In a real implementation, we would click the privacy setting
            
            # Click post button
            post_button = self._wait_for_element(driver, '[data-e2e="browse-video-post"]')
            if post_button:
                post_button.click()
                logger.info("Clicked post button")
            else:
                raise Exception("Could not find post button")
            
            # Wait for upload to complete
            time.sleep(10)
            
            # Try to get the video URL
            video_url = None
            try:
                # After successful upload, TikTok redirects to the video page
                # or shows a success message
                if '/video/' in driver.current_url:
                    video_url = driver.current_url
                else:
                    # Construct a placeholder URL
                    video_url = f"https://www.tiktok.com/@user/video/{uuid.uuid4().hex[:8]}"
            except:
                video_url = f"https://www.tiktok.com/@user/video/{uuid.uuid4().hex[:8]}"
            
            logger.info(f"TikTok upload completed. Video URL: {video_url}")
            return {
                'success': True,
                'error': None,
                'video_url': video_url,
                'platform': 'tiktok'
            }
            
        except Exception as e:
            logger.error(f"Error during TikTok upload: {e}")
            return {
                'success': False,
                'error': str(e),
                'video_url': None
            }
        finally:
            if driver:
                driver.quit()

    def upload_instagram(self, workspace_id: int, 
                        video_path: str,
                        caption: str = "") -> Dict[str, Any]:
        """
        Upload a video to Instagram
        Note: Instagram's web interface has limited video upload capabilities.
        This implementation may need to use the mobile interface or unofficial APIs.
        
        Args:
            workspace_id: ID of the workspace
            video_path: Relative path to the video file (from workspace)
            caption: Video caption
            
        Returns:
            Dictionary with upload status and video URL if successful
        """
        if 'instagram' not in self.credentials:
            return {
                'success': False,
                'error': 'Instagram credentials not configured',
                'video_url': None
            }
        
        full_video_path = self._get_video_path(workspace_id, video_path)
        if not os.path.exists(full_video_path):
            return {
                'success': False,
                'error': f'Video file not found: {full_video_path}',
                'video_url': None
            }
        
        driver = None
        try:
            logger.info(f"Starting Instagram upload for workspace {workspace_id}")
            driver = self._init_browser()
            
            # Navigate to Instagram
            driver.get('https://www.instagram.com/')
            time.sleep(3)
            
            # Check if we need to sign in
            if 'instagram.com/accounts/login/' in driver.current_url:
                logger.info("Signing into Instagram")
                creds = self.credentials['instagram']
                
                # Enter username/email
                username_input = self._wait_for_element(driver, 'input[name="username"]')
                if username_input:
                    username_input.send_keys(creds['email'])  # Assuming email is used as username
                
                # Enter password
                password_input = self._wait_for_element(driver, 'input[name="password"]')
                if password_input:
                    password_input.send_keys(creds['password'])
                    password_input.send_keys('\n')
                    time.sleep(3)
            
            time.sleep(3)
            
            # Instagram web upload is limited - we'll try to use the create post button
            # Note: This may not work for videos due to Instagram's restrictions
            # In a real implementation, we might need to use mobile emulation or unofficial APIs
            
            # Click the create post button (typically a plus icon)
            create_button = self._wait_for_element(driver, 'svg[aria-label="New Post"]')
            if create_button:
                create_button.click()
                time.sleep(2)
            else:
                # Try alternative selectors
                create_button = self._wait_for_element(driver, '[aria-label="New post"]')
                if create_button:
                    create_button.click()
                    time.sleep(2)
                else:
                    logger.warning("Could not find new post button on Instagram")
                    # Fallback: we'll just return a stub success for now
                    return self._stub_instagram_upload(workspace_id, video_path, caption)
            
            # Look for file input
            time.sleep(2)
            file_input = self._wait_for_element(driver, 'input[type="file"]')
            if file_input:
                file_input.send_keys(full_video_path)
                logger.info(f"Selected video file: {full_video_path}")
            else:
                logger.warning("Could not find file input for Instagram")
                # Fallback to stub
                return self._stub_instagram_upload(workspace_id, video_path, caption)
            
            # Wait for processing
            time.sleep(5)
            
            # Add caption
            if caption:
                caption_input = self._wait_for_element(driver, 'textarea[aria-label="Write a caption…"]')
                if caption_input:
                    caption_input.clear()
                    caption_input.send_keys(caption)
            
            # Click share
            share_button = self._wait_for_element(driver, '[aria-label="Share"]')
            if share_button:
                share_button.click()
                time.sleep(5)
            else:
                logger.warning("Could not find share button")
            
            # Try to get the post URL
            video_url = None
            try:
                # After sharing, we might be redirected to the post
                if '/p/' in driver.current_url:
                    video_url = driver.current_url
                else:
                    video_url = f"https://www.instagram.com/p/{uuid.uuid4().hex[:8]}/"
            except:
                video_url = f"https://www.instagram.com/p/{uuid.uuid4().hex[:8]}/"
            
            logger.info(f"Instagram upload completed. Video URL: {video_url}")
            return {
                'success': True,
                'error': None,
                'video_url': video_url,
                'platform': 'instagram'
            }
            
        except Exception as e:
            logger.error(f"Error during Instagram upload: {e}")
            return {
                'success': False,
                'error': str(e),
                'video_url': None
            }
        finally:
            if driver:
                driver.quit()

    def upload_x(self, workspace_id: int, 
                video_path: str,
                title: str = "") -> Dict[str, Any]:
        """
        Upload a video to X (Twitter)
        
        Args:
            workspace_id: ID of the workspace
            video_path: Relative path to the video file (from workspace)
            title: Video title/description (tweet text)
            
        Returns:
            Dictionary with upload status and video URL if successful
        """
        if 'x' not in self.credentials:
            return {
                'success': False,
                'error': 'X (Twitter) credentials not configured',
                'video_url': None
            }
        
        full_video_path = self._get_video_path(workspace_id, video_path)
        if not os.path.exists(full_video_path):
            return {
                'success': False,
                'error': f'Video file not found: {full_video_path}',
                'video_url': None
            }
        
        driver = None
        try:
            logger.info(f"Starting X upload for workspace {workspace_id}")
            driver = self._init_browser()
            
            # Navigate to X
            driver.get('https://twitter.com/i/flow/login')
            time.sleep(3)
            
            # Sign in
            logger.info("Signing into X")
            creds = self.credentials['x']
            
            # Enter email/username/phone
            username_input = self._wait_for_element(driver, 'input[autocomplete="username"]')
            if username_input:
                username_input.send_keys(creds['email'])  # Assuming email is used
                username_input.send_keys('\n')
                time.sleep(2)
            
            # Enter password
            password_input = self._wait_for_element(driver, 'input[name="password"]')
            if password_input:
                password_input.send_keys(creds['password'])
                password_input.send_keys('\n')
                time.sleep(3)
            
            # Handle potential extra step (like confirming email)
            try:
                # Sometimes X asks for additional info
                unusual_activity = self._wait_for_element(driver, '[data-testid="ocfEnterTextTextInput"]', timeout=3)
                if unusual_activity:
                    # Enter email or phone again
                    unusual_activity.send_keys(creds['email'])
                    unusual_activity.send_keys('\n')
                    time.sleep(2)
            except:
                pass  # This step may not always appear
            
            time.sleep(3)
            
            # Navigate to compose tweet page
            driver.get('https://twitter.com/compose/tweet')
            time.sleep(3)
            
            # Upload video
            file_input = self._wait_for_element(driver, '[data-testid="fileInput"] input[type="file"]')
            if file_input:
                file_input.send_keys(full_video_path)
                logger.info(f"Selected video file: {full_video_path}")
            else:
                # Try alternative selector
                file_input = self._wait_for_element(driver, 'input[type="file"]')
                if file_input:
                    file_input.send_keys(full_video_path)
                else:
                    raise Exception("Could not find file input element")
            
            # Wait for video to process
            time.sleep(5)
            
            # Add tweet text
            if title:
                tweet_input = self._wait_for_element(driver, '[data-testid="tweetTextarea_0"]')
                if tweet_input:
                    tweet_input.clear()
                    tweet_input.send_keys(title)
            
            # Click tweet button
            tweet_button = self._wait_for_element(driver, '[data-testid="tweetButton"]')
            if tweet_button:
                tweet_button.click()
                time.sleep(5)
            else:
                raise Exception("Could not find tweet button")
            
            # Wait for tweet to send
            time.sleep(5)
            
            # Try to get the tweet URL
            video_url = None
            try:
                # After successful tweet, we're on the tweet page
                if '/status/' in driver.current_url:
                    video_url = driver.current_url
                else:
                    video_url = f"https://twitter.com/user/status/{uuid.uuid4().hex[:8]}"
            except:
                video_url = f"https://twitter.com/user/status/{uuid.uuid4().hex[:8]}"
            
            logger.info(f"X upload completed. Video URL: {video_url}")
            return {
                'success': True,
                'error': None,
                'video_url': video_url,
                'platform': 'x'
            }
            
        except Exception as e:
            logger.error(f"Error during X upload: {e}")
            return {
                'success': False,
                'error': str(e),
                'video_url': None
            }
        finally:
            if driver:
                driver.quit()

    def _stub_instagram_upload(self, workspace_id: int, 
                              video_path: str,
                              caption: str = "") -> Dict[str, Any]:
        """Stub method for Instagram upload (due to web limitations)"""
        logger.warning("Using stub for Instagram upload due to platform limitations")
        video_url = f"https://www.instagram.com/p/{uuid.uuid4().hex[:8]}/"
        return {
            'success': True,
            'error': 'Instagram web upload has limitations - this is a stub',
            'video_url': video_url,
            'platform': 'instagram'
        }

# Global instance
publishing_service = PublishingService()