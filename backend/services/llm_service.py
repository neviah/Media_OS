# backend/services/llm_service.py
"""
LLM Service for text generation and summarization
Handles interactions with various free LLMs (DeepSeek, Qwen, Llama, Phi, Gemma)
"""

import logging
from typing import Optional, Dict, Any
import json
import os

logger = logging.getLogger(__name__)

class LLMService:
    def __init__(self, model_name: str = None, api_base: str = None):
        """
        Initialize LLM service
        
        Args:
            model_name: Name of the LLM to use (deepseek, qwen, llama, phi, gemma, etc.)
            api_base: Base URL for the LLM API (if using external API)
        """
        # In a real implementation, we would:
        # 1. Load the model locally or configure API connection
        # 2. Set up tokenizer and generation parameters
        # 3. Handle model loading/unloading based on VRAM availability
        
        self.model_name = model_name or os.getenv("DEFAULT_LLM_MODEL", "phi-2")  # Default to a small model
        self.api_base = api_base or os.getenv("LLM_API_BASE", "http://localhost:8000/v1")  # Default to local API
        self.is_initialized = False
        
        # Generation parameters
        self.default_params = {
            "temperature": 0.7,
            "max_length": 512,
            "top_p": 0.9,
            "repetition_penalty": 1.1
        }
        
        logger.info(f"LLM Service initialized for model: {self.model_name}")
    
    def initialize(self):
        """Initialize the LLM model or API connection"""
        # In a real implementation:
        # 1. If using local model: load model and tokenizer
        # 2. If using API: test connection and validate model availability
        # 3. Set up any necessary context or prompts
        
        self.is_initialized = True
        logger.info(f"LLM model {self.model_name} initialized")
        return True
    
    def generate_text(self, prompt: str, 
                     max_length: int = None,
                     temperature: float = None,
                     top_p: float = None,
                     stop: Optional[list] = None) -> str:
        """
        Generate text from a prompt using the LLM
        
        Args:
            prompt: Input text prompt
            max_length: Maximum tokens to generate
            temperature: Sampling temperature (0.0 to 1.0+)
            top_p: Nucleus sampling parameter
            stop: List of strings that stop generation when encountered
            
        Returns:
            Generated text string
        """
        if not self.is_initialized:
            self.initialize()
        
        # Use default parameters if not specified
        params = self.default_params.copy()
        if max_length is not None:
            params["max_length"] = max_length
        if temperature is not None:
            params["temperature"] = temperature
        if top_p is not None:
            params["top_p"] = top_p
        if stop is not None:
            params["stop"] = stop
        
        # In a real implementation, we would:
        # 1. Tokenize the prompt
        # 2. Run the model to generate text
        # 3. Detokenize and return the result
        # 4. Apply any post-processing (stop words, etc.)
        
        # For stub, we'll return a placeholder response
        # In reality, this would call the actual LLM
        
        logger.debug(f"Generating text with params: {params}")
        
        # Simple stub responses based on prompt content
        if "summary" in prompt.lower() or "summarize" in prompt.lower():
            return "This is a concise summary of the provided news article, highlighting the key points and main takeaways."
        elif "script" in prompt.lower() or "generate" in prompt.lower():
            return "[Host appears on screen with friendly greeting]\n\nHello everyone! Welcome back to our channel. Today we're discussing an interesting development that I think you'll find fascinating.\n\n[Brief pause for emphasis]\n\nThe key points we need to cover are:\n1. What happened and why it matters\n2. How this affects our audience\n3. What we can expect moving forward\n\nLet's dive right in...\n\n[Detailed explanation of the topic with examples]\n\nAs we've seen, this development has significant implications. It's important to stay informed and consider how this might impact your decisions.\n\n[Call to action]\n\nIf you found this video helpful, please consider liking, subscribing, and sharing with others who might benefit from this information. Let us know your thoughts in the comments below!\n\n[Closing remarks]\n\nThanks for watching, and we'll see you in the next video!"
        elif "title" in prompt.lower() or "hashtag" in prompt.lower() or "metadata" in prompt.lower():
            if "title:" in prompt.lower():
                return "TITLE: Exciting News Update You Need to Know\nDESCRIPTION: Stay informed with our latest coverage of this important development. We break down what happened, why it matters, and what it means for you.\nHASHTAGS: #News #Update #Breaking #StayInformed"
            else:
                return "Exciting News Update You Need to Know"
        else:
            # Generic response
            return f"This is a generated response to the prompt: '{prompt[:50]}...' [Response truncated for stub]"
    
    def summarize(self, text: str, max_length: int = 150) -> str:
        """
        Summarize text using LLM
        
        Args:
            text: Text to summarize
            max_length: Maximum length of summary
            
        Returns:
            Summary text
        """
        prompt = f"""
        Please provide a concise summary of the following text:
        
        {text}
        
        Summary:
        """
        return self.generate_text(prompt, max_length=max_length)
    
    def generate_script(self, summary: str, style: str = "informative", 
                       length: str = "medium") -> str:
        """
        Generate a video script from a summary
        
        Args:
            summary: News summary or topic description
            style: Script style (informative, entertaining, persuasive, etc.)
            length: Desired length (short, medium, long)
            
        Returns:
            Generated script text
        """
        length_guide = {
            "short": "aim for a 30-60 second video",
            "medium": "aim for a 1-2 minute video", 
            "long": "aim for a 2-3 minute video"
        }
        
        prompt = f"""
        Generate an engaging video script based on the following summary.
        Style: {style}
        Length: {length_guide.get(length, length_guide['medium'])}
        
        Summary:
        {summary}
        
        The script should include:
        - A strong hook to grab attention
        - Clear, well-organized main content
        - Appropriate pacing for the {style} style
        - A call-to-action if suitable
        - Natural language suitable for spoken delivery
        
        Script:
        """
        return self.generate_text(prompt, max_length=800)
    
    def generate_hashtags(self, content: str, count: int = 5) -> str:
        """
        Generate relevant hashtags for content
        
        Args:
            content: Content to generate hashtags for
            count: Number of hashtags to generate
            
        Returns:
            Comma-separated hashtags string
        """
        prompt = f"""
        Generate {count} relevant hashtags for the following content.
        Make sure they are appropriate, relevant, and likely to improve discoverability.
        
        Content:
        {content}
        
        Hashtags (comma-separated):
        """
        result = self.generate_text(prompt, max_length=100)
        # Clean up result to just be hashtags
        hashtags = result.replace('#', '').split(',')
        hashtags = [tag.strip() for tag in hashtags if tag.strip()]
        return ','.join([f"#{tag}" for tag in hashtags[:count]])
    
    def generate_title(self, content: str) -> str:
        """
        Generate an engaging title for content
        
        Args:
            content: Content to generate title for
            
        Returns:
            Title string
        """
        prompt = f"""
        Generate a catchy, engaging title for the following content.
        The title should be under 100 characters and appropriate for the topic.
        
        Content:
        {content}
        
        Title:
        """
        return self.generate_text(prompt, max_length=50).strip()

# Global LLM service instance
llm_service = LLMService()