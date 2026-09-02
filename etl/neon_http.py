"""Minimal client for Neon's HTTP SQL endpoint (https://<host>/sql).

Used by the loader so it runs anywhere HTTPS is allowed, including sandboxes
that block outbound Postgres/5432. Honors HTTPS_PROXY and REQUESTS_CA_BUNDLE /
SSL_CERT_FILE via urllib's defaults.
"""
import json, os, ssl, time, urllib.request, urllib.error
from urllib.parse import urlsplit


class NeonHttp:
    def __init__(self, database_url=None, timeout=120):
        self.url = database_url or os.environ["DATABASE_URL"]
        host = urlsplit(self.url).hostname
        self.endpoint = f"https://{host}/sql"
        self.timeout = timeout
        cafile = os.environ.get("SSL_CERT_FILE") or os.environ.get("REQUESTS_CA_BUNDLE")
        self.ctx = ssl.create_default_context(cafile=cafile) if cafile else ssl.create_default_context()

    def _post(self, body, headers):
        data = json.dumps(body).encode()
        req = urllib.request.Request(self.endpoint, data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("Neon-Connection-String", self.url)
        for k, v in headers.items():
            req.add_header(k, v)
        last = None
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=self.timeout, context=self.ctx) as r:
                    return json.loads(r.read().decode())
            except urllib.error.HTTPError as e:
                text = e.read().decode(errors="replace")
                if e.code >= 500 and attempt < 3:
                    last = RuntimeError(f"HTTP {e.code}: {text[:500]}"); time.sleep(2 ** attempt); continue
                try:
                    msg = json.loads(text).get("message", text)
                except Exception:
                    msg = text
                raise RuntimeError(f"Neon HTTP {e.code}: {msg[:1000]}") from None
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                last = e
                if attempt < 3:
                    time.sleep(2 ** attempt); continue
        raise last

    def query(self, sql, params=None, array_mode=False):
        """Run one statement. Returns dict with rows, rowCount, command, fields."""
        headers = {"Neon-Array-Mode": "true"} if array_mode else {}
        return self._post({"query": sql, "params": list(params or [])}, headers)

    def rows(self, sql, params=None):
        return self.query(sql, params)["rows"]

    def scalar(self, sql, params=None):
        r = self.query(sql, params, array_mode=True)["rows"]
        return r[0][0] if r else None

    def transaction(self, statements):
        """Run several statements atomically. statements: list of (sql, params)."""
        body = {"queries": [{"query": s, "params": list(p or [])} for s, p in statements]}
        return self._post(body, {"Neon-Batch-Isolation-Level": "ReadCommitted"})


if __name__ == "__main__":
    c = NeonHttp()
    print(c.rows("select current_user as u, version() as v, now() as t"))
