
from typing import Any, Dict, List, Optional
import time
import os
from rich.console import Console
from loguru import logger

console = Console()

class ServiceError(Exception):
    pass

class BaseService:
    def __init__(self, name: str):
        self.name = name

    def get_metadata(self) -> Dict[str, Any]:
        return {}

    def execute(self, params: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError

class HFService(BaseService):
    def __init__(self, model_name: str, price_per_token: float, max_new_tokens: int = 32):
        super().__init__("hf")
        self.model_name = model_name
        self.price_per_token = price_per_token
        self.max_new_tokens = max_new_tokens
        self.model = None
        self.tokenizer = None
        self.device = None
        # We do NOT load immediately here to avoid blocking construction
        # The caller should call load_async

    def load_sync(self):
        """Blocking load."""
        self._load_model()

    def _load_model(self):
        console.log(f"[yellow]🤖 Loading model '{self.model_name}'... (This may take a while)[/yellow]")
        try:
            from .hf import load_model_and_tokenizer
            self.model, self.tokenizer, self.device = load_model_and_tokenizer(self.model_name)
            console.log(f"[green]✓ Model '{self.model_name}' loaded successfully[/green]")
        except ImportError:
            raise ServiceError("transformers not installed")
        except Exception as e:
            raise ServiceError(f"Failed to load model: {e}")

    def get_metadata(self) -> Dict[str, Any]:
        return {
            "models": [self.model_name],
            "price_per_token": self.price_per_token,
            "max_new_tokens": self.max_new_tokens
        }

    def execute(self, params: Dict[str, Any]) -> Dict[str, Any]:
        if not self.model:
            raise ServiceError("Model not loaded")
        
        prompt = params.get("prompt")
        max_new = int(params.get("max_new_tokens", self.max_new_tokens))
        
        if not prompt:
            raise ServiceError("Missing prompt")

        try:
            t0 = time.time()
            from .hf import generate_text
            text = generate_text(self.model, self.tokenizer, self.device, prompt, max_new)
            
            # Token accounting
            in_tokens = len(self.tokenizer.encode(prompt))
            out_tokens = len(self.tokenizer.encode(text))
            new_tokens = max(0, out_tokens - in_tokens)
            latency_ms = int((time.time() - t0) * 1000.0)
            cost = self.price_per_token * new_tokens
            
            return {
                "text": text,
                "tokens": new_tokens,
                "latency_ms": latency_ms,
                "price_per_token": self.price_per_token,
                "cost": cost
            }
        except Exception as e:
            raise ServiceError(str(e))

class OllamaService(BaseService):
    def __init__(self, model_name: str, host: str = "http://localhost:11434"):
        super().__init__("ollama")
        self.model_name = model_name
        self.host = host
        self.price_per_token = 0.0 # Typically free if local
        
    def load_sync(self):
        # Check connection
        import requests
        try:
            # Add timeout to prevent hanging
            res = requests.get(f"{self.host}/api/tags", timeout=5)
            if res.status_code != 200:
                raise ServiceError(f"Ollama reachable but returned {res.status_code}")
            
            # Check if model exists
            models = [m["name"] for m in res.json().get("models", [])]
            # Simple substring check because ollama models have tags like 'llama3:latest'
            if not any(self.model_name in m for m in models):
                 # Try pull? For now just warn or error.
                 console.log(f"[yellow]⚠️ Model '{self.model_name}' not found in Ollama '{self.host}'.[/yellow]")
                 console.log(f"[dim]Available: {models}[/dim]")
            else:
                 console.log(f"[green]✓ Ollama Model '{self.model_name}' ready[/green]")
                 
        except Exception as e:
            raise ServiceError(f"Ollama connection failed: {e}")

    def get_metadata(self) -> Dict[str, Any]:
        return {
            "models": [self.model_name],
            "price_per_token": self.price_per_token,
            "backend": "ollama"
        }

    def execute(self, params: Dict[str, Any]) -> Dict[str, Any]:
        import requests
        prompt = params.get("prompt")
        if not prompt:
            raise ServiceError("Missing prompt")
            
        try:
            t0 = time.time()
            # Non-streaming implementation for now
            payload = {
                "model": self.model_name,
                "prompt": prompt,
                "stream": False
            }
            res = requests.post(f"{self.host}/api/generate", json=payload, timeout=300) # Long timeout for gen
            if res.status_code != 200:
                raise ServiceError(f"Ollama Error: {res.text}")
            
            data = res.json()
            text = data.get("response", "")
            
            # Stats
            eval_count = data.get("eval_count", 0)
            duration_ns = data.get("total_duration", 0)
            latency_ms = duration_ns / 1_000_000 if duration_ns > 0 else (time.time() - t0) * 1000.0
            
            return {
                "text": text,
                "tokens": eval_count,
                "latency_ms": latency_ms,
                "price_per_token": self.price_per_token,
                "cost": 0.0
            }
        except Exception as e:
            raise ServiceError(f"Ollama Exec Error: {e}")

class HFRemoteService(BaseService):
    def __init__(self, model_name: str, token: Optional[str] = None, price_per_token: float = 0.005):
        super().__init__("hf_remote")
        self.model_name = model_name
        self.token = token or os.getenv("HUGGING_FACE_HUB_TOKEN")
        self.price_per_token = price_per_token
        self.client = None

    def load_sync(self):
        try:
            from huggingface_hub import InferenceClient
            self.client = InferenceClient(model=self.model_name, token=self.token)
            logger.success(f"HF Remote Client initialized for model '{self.model_name}' (remote)")
        except ImportError:
            raise ServiceError("huggingface_hub not installed. Run 'pip install huggingface-hub'")
        except Exception as e:
            raise ServiceError(f"Failed to init HF Remote Client: {e}")

    def get_metadata(self) -> Dict[str, Any]:
        return {
            "models": [self.model_name],
            "price_per_token": self.price_per_token,
            "tag": "remote",
            "backend": "hf_remote"
        }

    def execute(self, params: Dict[str, Any]) -> Dict[str, Any]:
        if not self.client:
            raise ServiceError("Remote client not initialized")
        
        prompt = params.get("prompt")
        max_new = int(params.get("max_new_tokens", 32))
        
        if not prompt:
            raise ServiceError("Missing prompt")

        try:
            t0 = time.time()
            # result = client.text_generation(...)
            response = self.client.text_generation(
                prompt,
                max_new_tokens=max_new,
                temperature=params.get("temperature", 0.7),
                do_sample=params.get("do_sample", True)
            )
            
            latency_ms = int((time.time() - t0) * 1000.0)
            
            # Rough estimation of tokens (char length / 4)
            tokens = len(response) // 4
            cost = self.price_per_token * tokens

            return {
                "text": response,
                "tokens": tokens,
                "latency_ms": latency_ms,
                "price_per_token": self.price_per_token,
                "cost": cost,
                "backend": "hf_remote"
            }
        except Exception as e:
            raise ServiceError(f"HF Remote Execution Error: {e}")
