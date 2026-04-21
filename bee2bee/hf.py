from __future__ import annotations
from typing import Any, Dict, Optional, List, Tuple
import json
from dataclasses import dataclass


def has_transformers() -> bool:
    try:
        import transformers  # noqa: F401
        return True
    except Exception:
        return False


def has_datasets() -> bool:
    try:
        import datasets  # noqa: F401
        return True
    except Exception:
        return False


def load_model_and_tokenizer(model_name: str, device: Optional[str] = None):
    import torch  # type: ignore
    from transformers import AutoModelForCausalLM, AutoTokenizer
    tok = AutoTokenizer.from_pretrained(model_name)
    mdl = AutoModelForCausalLM.from_pretrained(model_name)
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
    mdl = mdl.to(device)
    mdl.eval()
    return mdl, tok, device


def generate_text(model, tokenizer, device: str, prompt: str, max_new_tokens: int = 32, temperature: float = 0.7) -> str:
    import torch  # type: ignore
    inputs = tokenizer(prompt, return_tensors="pt").to(device)
    gen_kwargs = {"max_new_tokens": max_new_tokens}
    if temperature > 0:
        gen_kwargs["temperature"] = temperature
        gen_kwargs["do_sample"] = True
    with torch.no_grad():
        out = model.generate(**inputs, **gen_kwargs)
    return tokenizer.decode(out[0], skip_special_tokens=True)

def generate_text_stream(model, tokenizer, device: str, prompt: str, max_new_tokens: int = 512, temperature: float = 0.7):
    import torch # type: ignore
    from queue import Queue
    from threading import Thread
    from transformers import TextIteratorStreamer

    # 1. Prepare chat template if possible
    # Robust multi-line parsing
    messages = []
    current_role = None
    current_content = []
    
    for line in prompt.split("\n"):
        if line.startswith("user: "):
            if current_role: messages.append({"role": current_role, "content": "\n".join(current_content).strip()})
            current_role = "user"
            current_content = [line[6:]]
        elif line.startswith("assistant: "):
            if current_role: messages.append({"role": current_role, "content": "\n".join(current_content).strip()})
            current_role = "assistant"
            current_content = [line[11:]]
        elif current_role:
            current_content.append(line)
            
    if current_role:
        messages.append({"role": current_role, "content": "\n".join(current_content).strip()})
    
    if messages and hasattr(tokenizer, 'apply_chat_template'):
        try:
            formatted_prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
            inputs = tokenizer(formatted_prompt, return_tensors="pt").to(device)
        except Exception as e:
            logger.warning(f"Chat template failed: {e}")
            inputs = tokenizer(prompt, return_tensors="pt").to(device)
    else:
        inputs = tokenizer(prompt, return_tensors="pt").to(device)

    # 2. Use TextIteratorStreamer with specific delta-focused settings
    # Ensure we use skip_prompt=True to only get the AI response
    streamer = TextIteratorStreamer(tokenizer, skip_prompt=True, skip_special_tokens=True)
    
    gen_kwargs = {
        **inputs,
        "max_new_tokens": max_new_tokens,
        "streamer": streamer,
        "repetition_penalty": 1.15, # Prevent infinite loops
        "pad_token_id": tokenizer.eos_token_id
    }
    
    if temperature > 0:
        gen_kwargs["temperature"] = temperature
        gen_kwargs["do_sample"] = True
        gen_kwargs["top_p"] = 0.9
    else:
        gen_kwargs["do_sample"] = False
        
    thread = Thread(target=model.generate, kwargs=gen_kwargs)
    thread.start()
    
    # 3. Yield only non-empty deltas
    for new_text in streamer:
        if new_text:
            # Gemma/Llama models sometimes yield a leading space or special char in the first chunk
            # We strip it if it's the very first part of a turn if needed, but usually streamer handles it
            yield new_text


def export_torchscript(model, example_inputs) -> Any:
    import torch  # type: ignore
    model = model.eval()
    with torch.no_grad():
        traced = torch.jit.trace(model, example_inputs)
    return traced


def export_onnx(model, example_inputs, output_path: str):
    import torch  # type: ignore
    torch.onnx.export(
        model,
        example_inputs,
        output_path,
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        opset_version=14,
        dynamic_axes={"input_ids": {0: "batch", 1: "seq"}, "attention_mask": {0: "batch", 1: "seq"}, "logits": {0: "batch", 1: "seq"}},
    )
    return output_path


def load_dataset(name: str, split: str = "train", streaming: bool = False, **kwargs):
    from datasets import load_dataset
    ds = load_dataset(name, split=split, streaming=streaming, **kwargs)
    return ds


def preprocess_examples(dataset, tokenizer_name: str, text_field: str = "text", max_length: int = 128, lower_case: bool = False):
    from transformers import AutoTokenizer
    tokenizer = AutoTokenizer.from_pretrained(tokenizer_name)
    def _proc(batch):
        texts = batch[text_field]
        if lower_case:
            texts = [t.lower() for t in texts]
        enc = tokenizer(texts, padding="max_length", truncation=True, max_length=max_length)
        return enc
    return dataset.map(_proc, batched=True)


# DistilBERT partial wrapper for prototype partitioning
def build_distilbert_partial(model_name: str, start: int, end: int, device: Optional[str] = None):
    import torch  # type: ignore
    from transformers import AutoTokenizer, DistilBertModel
    tok = AutoTokenizer.from_pretrained(model_name)
    base = DistilBertModel.from_pretrained(model_name)
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
    base = base.to(device)
    class Partial(torch.nn.Module):
        def __init__(self, base, start, end):
            super().__init__()
            self.base = base
            self.start = start
            self.end = end
        def forward(self, input_ids=None, attention_mask=None, hidden_states=None):
            if hidden_states is None:
                # embeddings
                x = self.base.embeddings(input_ids)
            else:
                x = hidden_states
            mask = attention_mask
            for i in range(self.start, self.end):
                x = self.base.transformer.layer[i](x, attn_mask=mask)[0]
            return x
    part = Partial(base, start, end).to(device).eval()
    return part, tok, device


