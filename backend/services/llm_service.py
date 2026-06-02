# backend/services/llm_service.py
"""
LLM Service — Task-Routing AI Backend
======================================

This service routes each pipeline task to the best available model.
It supports three providers, tried in this priority order:

  1. OpenRouter  (cloud, free tier available — preferred for quality)
  2. LM Studio   (local, default port 1234)
  3. Ollama      (local, default port 11434)

All three providers expose an OpenAI-compatible REST API, so the same
client code works with all of them.

── Environment Variables ──────────────────────────────────────────────
  OPENROUTER_API_KEY   Your OpenRouter key (get one free at openrouter.ai)
  OPENROUTER_BASE_URL  Override OpenRouter endpoint (default: https://openrouter.ai/api/v1)

  LOCAL_LLM_BASE       Override local base URL. If not set, the service
                       auto-detects LM Studio (:1234) or Ollama (:11434).
  LOCAL_LLM_MODEL      Model name to send for local requests. Must match
                       whatever model you have loaded in LM Studio / Ollama.
                       Default: "local-model" (LM Studio uses this for the
                       currently loaded model).

  LLM_OVERRIDE_MODEL   When set, ALL tasks use this single model+provider,
                       bypassing the task-routing table entirely.
                       Useful for testing or forcing a specific model.
                       Example: LLM_OVERRIDE_MODEL=openrouter:qwen/qwen-2.5-72b-instruct:free

── Task → Model Routing Table ────────────────────────────────────────
  classify   → local model (fast, low-stakes; no API key needed)
  summarize  → openrouter: meta-llama/llama-3.3-70b-instruct:free
  script     → openrouter: qwen/qwen-2.5-72b-instruct:free  (best free creative writing)
  qa_check   → openrouter: deepseek/deepseek-r1:free         (reasoning model for fact-checking)
  default    → openrouter: meta-llama/llama-3.3-70b-instruct:free

  If OpenRouter is unavailable (no key / quota), the service falls back
  to whatever local model is loaded.

── Adding New Models ──────────────────────────────────────────────────
  Edit TASK_MODEL_MAP below. Keys are task names passed to generate_text().
  Values are "provider:model_id" strings.  Providers: "openrouter", "local".

── LM Studio vs. Ollama ──────────────────────────────────────────────
  LM Studio  → http://localhost:1234/v1   (default, no auth needed)
  Ollama     → http://localhost:11434/v1  (no auth needed)
  The service auto-probes both at startup if LOCAL_LLM_BASE is not set.
"""

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

# ── Task → Model routing table ────────────────────────────────────────────────
# Format: "provider:model_id"   provider is "openrouter" or "local"
# All openrouter model IDs ending in ":free" are on the free tier.
TASK_MODEL_MAP: dict[str, str] = {
    "classify":  "local:local-model",                                        # Small/fast; run locally
    "summarize": "openrouter:meta-llama/llama-3.3-70b-instruct:free",        # Fast, long-context
    "script":    "openrouter:qwen/qwen-2.5-72b-instruct:free",               # Best free creative writing
    "qa_check":  "openrouter:deepseek/deepseek-r1:free",                     # Reasoning model for fact-checking
    "hashtags":  "openrouter:meta-llama/llama-3.1-8b-instruct:free",         # Trivial task; small model
    "title":     "openrouter:meta-llama/llama-3.1-8b-instruct:free",         # Trivial task; small model
    "default":   "openrouter:meta-llama/llama-3.3-70b-instruct:free",        # Fallback for anything else
}

# ── Local provider auto-detection ─────────────────────────────────────────────
_LOCAL_CANDIDATES = [
    ("LM Studio", "http://localhost:1234/v1"),
    ("Ollama",    "http://localhost:11434/v1"),
]


def _detect_local_base() -> Optional[str]:
    """
    Probe known local LLM server ports. Returns the first responding base URL,
    or None if neither is reachable. Called once at service init.
    """
    import httpx
    custom = os.getenv("LOCAL_LLM_BASE")
    if custom:
        return custom.rstrip("/")
    for name, url in _LOCAL_CANDIDATES:
        try:
            r = httpx.get(f"{url}/models", timeout=2.0)
            if r.status_code < 500:
                logger.info(f"Local LLM detected: {name} at {url}")
                return url
        except Exception:
            pass
    logger.warning("No local LLM server detected (LM Studio or Ollama). Local tasks will fail.")
    return None


class LLMService:
    """
    Task-routing LLM service.

    Call generate_text(prompt, task="summarize") to route the request to the
    model best suited for that task.  Callers don't need to know which model
    or provider is used — just pass the task name.

    Supported task names: classify, summarize, script, qa_check, hashtags,
    title, default (catch-all).
    """

    def __init__(self):
        self.openrouter_api_key = os.getenv("OPENROUTER_API_KEY", "")
        self.openrouter_base    = os.getenv("OPENROUTER_BASE_URL",
                                            "https://openrouter.ai/api/v1").rstrip("/")
        self.local_model        = os.getenv("LOCAL_LLM_MODEL", "local-model")
        self.override           = os.getenv("LLM_OVERRIDE_MODEL", "")

        # Lazy-detect local server; stored after first call
        self._local_base: Optional[str] = None
        self._local_probed = False

        if self.openrouter_api_key:
            logger.info("LLMService: OpenRouter key present — cloud models available.")
        else:
            logger.warning(
                "LLMService: OPENROUTER_API_KEY not set. "
                "All tasks will fall back to the local LLM server."
            )

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _local_base_url(self) -> Optional[str]:
        if not self._local_probed:
            self._local_base = _detect_local_base()
            self._local_probed = True
        return self._local_base

    def _get_openai_client(self, provider: str):
        """Return a configured openai.OpenAI client for the given provider."""
        try:
            import openai
        except ImportError as exc:
            raise RuntimeError(
                "openai package is required. Run: pip install openai"
            ) from exc

        if provider == "openrouter":
            if not self.openrouter_api_key:
                raise RuntimeError(
                    "OPENROUTER_API_KEY env var is not set. "
                    "Sign up free at https://openrouter.ai and set the key."
                )
            return openai.OpenAI(
                api_key=self.openrouter_api_key,
                base_url=self.openrouter_base,
            )

        # provider == "local" (LM Studio or Ollama)
        local_base = self._local_base_url()
        if not local_base:
            raise RuntimeError(
                "No local LLM server found on ports 1234 (LM Studio) or 11434 (Ollama). "
                "Start LM Studio or Ollama, or set LOCAL_LLM_BASE env var."
            )
        return openai.OpenAI(api_key="local", base_url=local_base)

    def _resolve_task(self, task: str) -> tuple[str, str]:
        """
        Resolve a task name to (provider, model_id).
        Honors LLM_OVERRIDE_MODEL if set.
        """
        if self.override:
            parts = self.override.split(":", 1)
            if len(parts) == 2:
                return parts[0], parts[1]
            # Bare model name with no provider prefix → assume openrouter
            return "openrouter", self.override

        route = TASK_MODEL_MAP.get(task) or TASK_MODEL_MAP["default"]
        provider, model_id = route.split(":", 1)
        return provider, model_id

    def get_runtime_status(self) -> dict:
        """
        Return a diagnostics payload for current LLM runtime availability.

        This is safe for UI polling and avoids exposing secrets.
        """
        import httpx

        status = {
            "override_model": self.override or None,
            "routing": TASK_MODEL_MAP,
            "openrouter": {
                "configured": bool(self.openrouter_api_key),
                "base_url": self.openrouter_base,
                "authenticated": False,
                "error": None,
            },
            "local": {
                "configured_base": os.getenv("LOCAL_LLM_BASE") or None,
                "detected_base": None,
                "provider": None,
                "reachable": False,
                "model": self.local_model,
                "error": None,
            },
        }

        if self.openrouter_api_key:
            try:
                response = httpx.get(
                    f"{self.openrouter_base}/models",
                    headers={"Authorization": f"Bearer {self.openrouter_api_key}"},
                    timeout=3.5,
                )
                if response.status_code == 200:
                    status["openrouter"]["authenticated"] = True
                else:
                    status["openrouter"]["error"] = f"HTTP {response.status_code}"
            except Exception as exc:
                status["openrouter"]["error"] = str(exc)
        else:
            status["openrouter"]["error"] = "OPENROUTER_API_KEY not set"

        local_base = self._local_base_url()
        status["local"]["detected_base"] = local_base
        if local_base:
            if "1234" in local_base:
                status["local"]["provider"] = "lmstudio"
            elif "11434" in local_base:
                status["local"]["provider"] = "ollama"
            else:
                status["local"]["provider"] = "custom"

            try:
                response = httpx.get(f"{local_base}/models", timeout=2.5)
                if response.status_code < 500:
                    status["local"]["reachable"] = True
                else:
                    status["local"]["error"] = f"HTTP {response.status_code}"
            except Exception as exc:
                status["local"]["error"] = str(exc)
        else:
            status["local"]["error"] = "No local provider detected"

        return status

    # ── Public API ────────────────────────────────────────────────────────────

    def generate_text(
        self,
        prompt: str,
        task: str = "default",
        max_tokens: int = 1024,
        temperature: float = 0.7,
        system_prompt: Optional[str] = None,
        # Legacy param names kept for backward compatibility
        max_length: int = None,
        top_p: float = None,
        stop: Optional[list] = None,
    ) -> str:
        """
        Generate text for the given prompt, routing to the best model for the task.

        Args:
            prompt:        The user-facing prompt text.
            task:          Pipeline task name used for model routing.
                           One of: classify, summarize, script, qa_check,
                           hashtags, title, default.
            max_tokens:    Maximum tokens to generate (default 1024).
            temperature:   Sampling temperature 0.0–2.0 (default 0.7).
            system_prompt: Optional system message prepended to the conversation.
            max_length:    Alias for max_tokens (backward-compat).
            top_p:         Nucleus sampling (passed through to the API).
            stop:          Stop sequences (passed through to the API).

        Returns:
            Generated text string.

        Raises:
            RuntimeError: If the selected provider is unavailable.
        """
        effective_max = max_length if max_length is not None else max_tokens
        provider, model_id = self._resolve_task(task)

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        kwargs: dict = {
            "model":       model_id,
            "messages":    messages,
            "max_tokens":  effective_max,
            "temperature": temperature,
        }
        if top_p is not None:
            kwargs["top_p"] = top_p
        if stop:
            kwargs["stop"] = stop

        logger.debug(f"LLM request: task={task} provider={provider} model={model_id}")

        # Try primary provider; fall back to local if cloud fails
        try:
            client = self._get_openai_client(provider)
            response = client.chat.completions.create(**kwargs)
            return response.choices[0].message.content.strip()

        except Exception as primary_err:
            if provider == "openrouter":
                logger.warning(
                    f"OpenRouter call failed ({primary_err}). "
                    "Retrying with local LLM..."
                )
                try:
                    local_client = self._get_openai_client("local")
                    kwargs["model"] = self.local_model
                    response = local_client.chat.completions.create(**kwargs)
                    return response.choices[0].message.content.strip()
                except Exception as local_err:
                    raise RuntimeError(
                        f"Both OpenRouter and local LLM failed.\n"
                        f"  OpenRouter error: {primary_err}\n"
                        f"  Local error:      {local_err}"
                    ) from local_err
            raise

    # ── Convenience wrappers (thin; keep callers readable) ────────────────────

    def summarize(self, text: str, max_tokens: int = 300) -> str:
        """Summarize the given text. Routes to the summarize model."""
        prompt = (
            "Provide a concise, factual summary of the following article. "
            "Focus on the key facts, actors, and implications. "
            "Write 2–4 sentences.\n\n"
            f"{text}\n\nSummary:"
        )
        return self.generate_text(
            prompt,
            task="summarize",
            max_tokens=max_tokens,
            system_prompt="You are a professional news editor. Be concise and factual.",
        )

    def generate_script(
        self,
        summary: str,
        style: str = "informative",
        length: str = "medium",
    ) -> str:
        """
        Generate a video script from a news summary.
        Routes to the script model (best free creative writing model).
        """
        word_targets = {"short": "150–250", "medium": "250–400", "long": "400–600"}
        target = word_targets.get(length, word_targets["medium"])

        prompt = (
            f"Write a {style} video script based on the following news summary.\n"
            f"Target length: {target} words (spoken delivery).\n\n"
            f"Summary:\n{summary}\n\n"
            "Requirements:\n"
            "- Strong hook in the first 10 seconds\n"
            "- Clear, conversational language — no jargon\n"
            "- Stage directions in [square brackets]\n"
            "- End with a call-to-action (like, subscribe, comment)\n\n"
            "Script:"
        )
        return self.generate_text(
            prompt,
            task="script",
            max_tokens=900,
            system_prompt=(
                "You are an experienced YouTube scriptwriter. "
                "Write natural, engaging scripts suitable for text-to-speech."
            ),
        )

    def qa_check(self, script: str, source_summary: str) -> str:
        """
        Fact-check a generated script against the source summary.
        Routes to the reasoning model (DeepSeek R1 free).
        Returns a short assessment: PASS or list of issues.
        """
        prompt = (
            "Compare the following video script to the source summary.\n"
            "Identify any factual errors, unsupported claims, or hallucinations.\n\n"
            f"Source summary:\n{source_summary}\n\n"
            f"Script to check:\n{script}\n\n"
            "Reply with either:\n"
            '  PASS — if the script accurately represents the source\n'
            "  ISSUES: [bullet list of specific problems]\n\n"
            "Assessment:"
        )
        return self.generate_text(
            prompt,
            task="qa_check",
            max_tokens=300,
            temperature=0.2,
            system_prompt="You are a rigorous fact-checker. Be precise and brief.",
        )

    def generate_hashtags(self, content: str, count: int = 5) -> str:
        """Generate comma-separated hashtags for content."""
        prompt = (
            f"Generate exactly {count} relevant hashtags for the content below.\n"
            "Return only the hashtags, comma-separated, no explanation.\n\n"
            f"Content:\n{content}\n\nHashtags:"
        )
        result = self.generate_text(prompt, task="hashtags", max_tokens=80, temperature=0.5)
        tags = [t.strip().lstrip("#") for t in result.split(",") if t.strip()]
        return ",".join(f"#{t}" for t in tags[:count])

    def generate_title(self, content: str) -> str:
        """Generate a short, catchy title for the given content."""
        prompt = (
            "Generate ONE catchy, YouTube-optimised title (under 80 characters) "
            "for the following content. Return only the title, nothing else.\n\n"
            f"Content:\n{content}\n\nTitle:"
        )
        return self.generate_text(prompt, task="title", max_tokens=60, temperature=0.8).strip()


# ── Module-level singleton ─────────────────────────────────────────────────────
llm_service = LLMService()