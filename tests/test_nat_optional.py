import asyncio


def test_run():
    from bee2bee.nat import try_upnp_map, try_stun
    
    async def _test():
        # Test UPnP - returns (success: bool, external_ip: Optional[str])
        ok, ip = await try_upnp_map(5555)
        assert isinstance(ok, bool)
        assert (ip is None) or isinstance(ip, str)
        
        # Test STUN - returns (ip, port) tuple or None
        out = await try_stun()
        assert (out is None) or isinstance(out, tuple)
    
    asyncio.run(_test())

