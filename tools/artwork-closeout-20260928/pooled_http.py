"""Bounded, proxy-aware pooled HTTP with the same exact-host controls as scan.py."""
import asyncio,atexit,threading
from urllib.error import HTTPError
import aiohttp
from scan import safe
_loop=asyncio.new_event_loop()
_thread=threading.Thread(target=_loop.run_forever,daemon=True)
_thread.start()
_session=None
async def request(url,hosts,limit):
    global _session
    if _session is None:
        _session=aiohttp.ClientSession(trust_env=True,timeout=aiohttp.ClientTimeout(total=25),connector=aiohttp.TCPConnector(limit=6,limit_per_host=4,keepalive_timeout=45),headers={'User-Agent':'Stackr-artwork-reconciliation/1.0'})
    for attempt in range(2):
        current=url
        try:
            for redirect in range(5):
                safe(current,hosts)
                async with _session.get(current,allow_redirects=False) as response:
                    if response.status in (301,302,303,307,308):
                        from urllib.parse import urljoin
                        current=urljoin(current,response.headers.get('Location',''));continue
                    if response.status in (429,500,502,503,504) and attempt==0:
                        delay=response.headers.get('Retry-After','2')
                        if delay.isdigit() and int(delay)<=30:
                            await asyncio.sleep(max(2,int(delay)));break
                    if response.status!=200:raise HTTPError(current,response.status,response.reason,response.headers,None)
                    body=bytearray()
                    async for chunk in response.content.iter_chunked(65536):
                        body.extend(chunk)
                        if len(body)>limit:raise ValueError('Response size limit')
                    return bytes(body),response.content_type,str(response.url)
            else:raise ValueError('Too many redirects')
        except (aiohttp.ClientError,TimeoutError):
            if attempt:raise
            await asyncio.sleep(2)
    raise RuntimeError('Request failed after bounded retry')
def get(url,hosts,limit=4*1024*1024):
    safe(url,hosts)
    return asyncio.run_coroutine_threadsafe(request(url,hosts,limit),_loop).result(timeout=85)
def close():
    if _session is not None and _loop.is_running():
        try:asyncio.run_coroutine_threadsafe(_session.close(),_loop).result(timeout=3)
        except Exception:pass
    _loop.call_soon_threadsafe(_loop.stop)
atexit.register(close)
