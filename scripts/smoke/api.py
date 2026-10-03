import json, urllib.request, urllib.parse, http.cookiejar, uuid, os

B = "http://localhost:3111"
jar = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar), urllib.request.HTTPRedirectHandler())
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
op_nr = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar), NoRedirect())

def call(method, path, body=None, raw=None, headers=None):
    h = dict(headers or {})
    data = raw
    if body is not None:
        data = json.dumps(body).encode(); h["Content-Type"] = "application/json"
    req = urllib.request.Request(B + path, data=data, method=method, headers=h)
    try:
        with op_nr.open(req) as r:
            t = r.read().decode(); return r.status, (json.loads(t) if t and r.headers.get("content-type","").startswith("application/json") else t)
    except urllib.error.HTTPError as e:
        t = e.read().decode()
        try: return e.code, json.loads(t)
        except Exception: return e.code, t

ok = True
def check(name, cond, extra=""):
    global ok
    ok &= bool(cond); print(("PASS " if cond else "FAIL ") + name + (f"  {extra}" if not cond else ""))

# --- auth
s,_ = call("GET", "/api/dashboard"); check("unauthenticated API is redirected, not served", s in (302,307))
_,c = call("GET", "/api/auth/csrf")
s,_ = call("POST", "/api/auth/callback/credentials", raw=urllib.parse.urlencode({"csrfToken": c["csrfToken"], "email": "smoke@example.com", "password": os.environ["T_PW"]}).encode(), headers={"Content-Type":"application/x-www-form-urlencoded"})
s,d = call("GET", "/api/dashboard"); check("login works", s == 200, (s,d))

cats = call("GET", "/api/categories")[1]
food = next(x for x in cats if x["name"] == "อาหาร")
check("default categories seeded with icons", food["icon"] == "restaurant")

# --- record + split
s,r = call("POST", "/api/entries", {"kind":"expense","total":10000,"categoryId":food["id"],"split":{"kind":"split"}})
check("POST /api/entries 201", s == 201, (s,r))
check("first log: +10 XP, streak 1, partner share 5000", r["xpGained"]==10 and r["streak"]==1 and r["entry"]["partnerShare"]==5000, r)
eid = r["entry"]["id"]
s,r2 = call("POST", "/api/entries", {"kind":"expense","total":6000}); check("second entry +1 XP", r2["xpGained"]==1, r2)
s,r3 = call("POST", "/api/entries", {"kind":"income","total":100,"split":{"kind":"split"}}); check("income can't be fronted -> 422", s==422 and r3["error"]["code"]=="INVALID_SPLIT", r3)
s,r3 = call("POST", "/api/entries", {"kind":"expense","total":-5}); check("negative amount -> 400", s==400, r3)
s,r3 = call("POST", "/api/entries", {"kind":"expense","total":1.5}); check("fractional satang -> 400", s==400, r3)

# --- repayment
s,r = call("POST", "/api/repayments", {"amount":3000}); check("repay 30 of 50 -> 20 left", s==201 and r["balanceAfter"]==2000, r)
s,r = call("POST", "/api/repayments", {"amount":2001}); check("over-repay -> 409", s==409 and r["error"]["code"]=="REPAYMENT_EXCEEDS_BALANCE", r)

# --- dashboard / outstanding / lists
s,d = call("GET", "/api/dashboard")
check("dashboard: balance, totals, streak, layout", d["partnerBalance"]==2000 and d["todayTotals"]["spent"]==11000 and d["streak"]["current"]==1 and len(d["layout"])==6, d)
s,o = call("GET", "/api/partner/outstanding"); check("outstanding = 2000 on the fronted entry", o["balance"]==2000 and o["items"][0]["id"]==eid, o)
s,l = call("GET", "/api/entries?day="+d["today"]); check("entries of today incl. repayment", s==200 and len(l)==3, (s,l))
s,cal = call("GET", "/api/calendar?month="+d["today"][:7])
today_cell = next(x for x in cal["days"] if x["day"]==d["today"])
check("calendar today: spent 110, logged", today_cell["spent"]==11000 and today_cell["logged"]=="entry", today_cell)
s,x = call("GET", "/api/calendar?month=2026-13"); check("bad month -> 400", s==400, x)

# --- no-spend
s,x = call("POST", "/api/no-spend"); check("no-spend after logging today -> 409", s==409 and x["error"]["code"]=="NO_SPEND_ALREADY_LOGGED", x)

# --- edit / delete guard
s,x = call("PATCH", f"/api/entries/{eid}", {"split":{"kind":"none"}}); check("edit that makes balance negative -> 409", s==409 and x["error"]["code"]=="BALANCE_WOULD_GO_NEGATIVE", x)
s,x = call("PATCH", f"/api/entries/{eid}", {"note":"ข้าวมันไก่"}); check("PATCH note ok", s==200 and x["note"]=="ข้าวมันไก่", x)
s,x = call("DELETE", f"/api/entries/{eid}"); check("delete fronted entry covered by repayment -> 409", s==409, x)
s,x = call("DELETE", f"/api/entries/{uuid.uuid4()}"); check("delete unknown -> 404", s==404, x)
s,x = call("DELETE", f"/api/entries/{r2['entry']['id']}"); check("delete plain entry -> 204", s==204, x)

# --- settings / presets / categories
s,x = call("PATCH", "/api/settings", {"partnerNote":"ชอบนมเปรี้ยว","dashboardLayout":[{"id":"calendar","enabled":True},{"id":"bogus","enabled":True}]})
check("settings: layout normalised, unknown id dropped", s==200 and x["dashboardLayout"][0]["id"]=="calendar" and all(i["id"]!="bogus" for i in x["dashboardLayout"]), x)
s,p = call("POST", "/api/presets", {"label":"BTS","icon":"train","amount":4700}); check("preset create 201", s==201, p)
s,x = call("PATCH", f"/api/presets/{p['id']}", {"amount":5000}); check("preset patch", x["amount"]==5000, x)
s,x = call("POST", "/api/presets", {"label":"x","icon":"Bad Icon!","amount":1}); check("icon name validated -> 400", s==400, x)
s,x = call("DELETE", f"/api/presets/{p['id']}"); check("preset delete 204", s==204, x)
s,x = call("DELETE", f"/api/categories/{cats[-1]['id']}"); check("category 'delete' archives", s==204, x)
check("archived category stays in list", any(c["id"]==cats[-1]["id"] and c["archived"] for c in call("GET","/api/categories")[1]))

# --- receipt: save (no AI)
s,x = call("POST", "/api/receipts", {"merchant":"ร้านทดสอบ","total":15000,"lines":[
  {"rawName":"ข้าวปั้น","canonicalName":"ข้าวปั้น","qty":1,"price":3500,"owner":"me"},
  {"rawName":"DUTCHMILL","canonicalName":"นมเปรี้ยว","qty":2,"price":4500,"owner":"partner"},
  {"rawName":"แชมพู","canonicalName":"แชมพู","qty":1,"price":8900,"owner":"split"}]})
check("receipt save 201, lines scaled to paid total", s==201 and x["entry"]["total"]==15000 and x["entry"]["source"]=="receipt", x)
s,x = call("PATCH", f"/api/entries/{x['entry']['id']}", {"total":999}); check("receipt entry amount locked -> 409", s==409 and x["error"]["code"]=="ENTRY_LOCKED", x)

print("\nALL PASS" if ok else "\nSOME FAILED")
