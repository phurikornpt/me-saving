import json, urllib.request, urllib.parse, http.cookiejar, os, uuid, time
B="http://localhost:3111"
jar=http.cookiejar.CookieJar()
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*a,**k): return None
op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar),NoRedirect())
def call(method,path,raw=None,headers=None):
    req=urllib.request.Request(B+path,data=raw,method=method,headers=headers or {})
    try:
        with op.open(req) as r:
            t=r.read().decode(); return r.status,(json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t=e.read().decode()
        try: return e.code,json.loads(t)
        except Exception: return e.code,t
def multipart(name,filename,ctype,data):
    b=uuid.uuid4().hex
    body=(f"--{b}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{filename}\"\r\nContent-Type: {ctype}\r\n\r\n").encode()+data+f"\r\n--{b}--\r\n".encode()
    return body,{"Content-Type":f"multipart/form-data; boundary={b}"}
_,c=call("GET","/api/auth/csrf")
call("POST","/api/auth/callback/credentials",urllib.parse.urlencode({"csrfToken":c["csrfToken"],"email":"smoke@example.com","password":os.environ["T_PW"]}).encode(),{"Content-Type":"application/x-www-form-urlencoded"})
img=open("/tmp/claude-501/receipt.jpg","rb").read()

ok=True
def check(n,c,e=""):
    global ok; ok&=bool(c); print(("PASS " if c else "FAIL ")+n+(f"  {e}" if not c else ""))

# remember one owner first, so we can see memory beat the AI
call("POST","/api/receipts",json.dumps({"total":1500,"lines":[{"rawName":"x","canonicalName":"ขนมปัง","qty":1,"price":1500,"owner":"me"}]}).encode(),{"Content-Type":"application/json"})

t=time.time(); b,h=multipart("image","r.jpg","image/jpeg",img); s,d=call("POST","/api/receipt/parse",b,h); dt=time.time()-t
check("parse 200", s==200, (s,d))
if s==200:
    print(f"   {dt:.1f}s  {d['merchant']} {d['date']} total={d['total']} mismatch={d['sumMismatch']}")
    for l in d["lines"]: print("   ",l["canonicalName"],l["price"],l["owner"],l["ownerSource"],"LOW" if l["lowConfidence"] else "")
    by={l["canonicalName"]:l for l in d["lines"]}
    check("no discount row among the lines", not any("ส่วนลด" in l["rawName"] for l in d["lines"]))
    check("memory beats AI for the remembered item", by.get("ขนมปัง",{}).get("ownerSource")=="memory" and by["ขนมปัง"]["owner"]=="me", by.get("ขนมปัง"))
    check("sumMismatch because of the printed member discount", d["sumMismatch"] is True)
    check("Buddhist-era date converted", d["date"]=="2026-10-03", d["date"])

b,h=multipart("image","r.gif","image/gif",b"GIF89a"); s,d=call("POST","/api/receipt/parse",b,h); check("wrong type -> 422", s==422 and d["error"]["code"]=="INVALID_RECEIPT",(s,d))
s,d=call("POST","/api/receipt/parse",b"{}",{"Content-Type":"application/json"}); check("no file -> 422", s==422,(s,d))
b,h=multipart("image","big.jpg","image/jpeg",b"0"*(4*1024*1024+1)); s,d=call("POST","/api/receipt/parse",b,h); check("oversized -> 422 (or 413)", s in (422,413),(s,str(d)[:80]))
s,_=call("GET","/api/wake"); check("wake 204", s==204, s)
print("\nALL PASS" if ok else "\nSOME FAILED")
