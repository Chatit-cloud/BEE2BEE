#!/usr/bin/env python3
"""
Debug script to test generation request directly
"""

import asyncio
import json
import websockets
from bee2bee.p2p_runtime import P2PNode

async def test_direct_generation():
    """Test generation by connecting directly to the deploy-hf server"""
    print("=== Direct Generation Test ===")
    
    # Connect directly to the running deploy-hf server
    server_url = "ws://127.0.0.1:4334"
    
    try:
        print(f"Connecting to {server_url}...")
        async with websockets.connect(server_url) as ws:
            print("Connected to server")
            
            # Send hello message
            hello_msg = {
                "type": "hello",
                "peer_id": "test-client-123",
                "services": {}
            }
            await ws.send(json.dumps(hello_msg))
            print("Sent hello message")
            
            # Wait for hello response
            response = await ws.recv()
            data = json.loads(response)
            print(f"Received: {data['type']}")
            
            # Send generation request
            gen_request = {
                "type": "gen_request",
                "rid": "test-request-123",
                "prompt": "Hello, how are you?",
                "max_new_tokens": 20,
                "model": "distilgpt2"
            }
            await ws.send(json.dumps(gen_request))
            print("Sent generation request")
            
            # Wait for generation response
            print("Waiting for generation response...")
            
            # Listen for messages for up to 30 seconds
            timeout = 30
            start_time = asyncio.get_event_loop().time()
            
            while True:
                try:
                    # Wait for message with timeout
                    remaining_time = timeout - (asyncio.get_event_loop().time() - start_time)
                    if remaining_time <= 0:
                        print("Timeout waiting for generation response")
                        break
                        
                    response = await asyncio.wait_for(ws.recv(), timeout=remaining_time)
                    data = json.loads(response)
                    print(f"Received message: {data['type']}")
                    
                    if data['type'] == 'gen_result':
                        if 'error' in data:
                            print(f"Generation error: {data['error']}")
                        else:
                            print(f"Generation successful!")
                            print(f"Generated text: {data.get('text', 'N/A')}")
                            print(f"Tokens: {data.get('tokens', 'N/A')}")
                            print(f"Latency: {data.get('latency_ms', 'N/A')}ms")
                            print(f"Cost: {data.get('cost', 'N/A')}")
                        break
                        
                except asyncio.TimeoutError:
                    print("Timeout waiting for generation response")
                    break
                except Exception as e:
                    print(f"Error receiving message: {e}")
                    break
                    
    except Exception as e:
        print(f"Connection error: {e}")
        return False
        
    return True

async def test_p2p_node_generation():
    """Test generation using P2PNode class"""
    print("\n=== P2PNode Generation Test ===")
    
    try:
        # Create a client node
        node = P2PNode(host="127.0.0.1", port=0)
        await node.start()
        print(f"Client node started: {node.addr}")
        
        # Connect to bootstrap
        bootstrap_url = "ws://127.0.0.1:4334"
        await node.connect_bootstrap(bootstrap_url)
        print("Connected to bootstrap")
        
        # Wait for service discovery
        print("Waiting for service discovery...")
        await asyncio.sleep(3)
        
        print(f"Found {len(node.providers)} providers")
        for pid, info in node.providers.items():
            print(f"   - {pid}: {info}")
        
        # Pick provider
        provider = node.pick_provider("distilgpt2")
        if not provider:
            print("No provider found for distilgpt2")
            return False
            
        pid, provider_info = provider
        print(f"Selected provider: {pid}")
        
        # Request generation
        print("Requesting generation...")
        result = await node.request_generation(
            pid, 
            "Hello, how are you?", 
            max_new_tokens=20, 
            model_name="distilgpt2"
        )
        
        if result:
            print(f"Generation successful!")
            print(f"Result: {result}")
        else:
            print("Generation failed - no result")
            
        await node.stop()
        print("Client node stopped")
        return True
        
    except Exception as e:
        print(f"P2PNode test error: {e}")
        return False

async def main():
    print("Bee2Bee Generation Debug Tool")
    print("================================\n")
    
    # Test 1: Direct WebSocket connection
    success1 = await test_direct_generation()
    
    # Test 2: P2PNode class
    success2 = await test_p2p_node_generation()
    
    print("\n=== Summary ===")
    print(f"Direct WebSocket test: {'PASS' if success1 else 'FAIL'}")
    print(f"P2PNode class test: {'PASS' if success2 else 'FAIL'}")
    
    if success1 and success2:
        print("\nAll tests passed! Generation is working correctly.")
    else:
        print("\nSome tests failed. Check the server logs for more details.")

if __name__ == "__main__":
    asyncio.run(main())