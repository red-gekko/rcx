#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

HOST = "0.0.0.0"
PORT = 8000

server = ThreadingHTTPServer((HOST, PORT), SimpleHTTPRequestHandler)
print(f"Serving files on http://localhost:{PORT}")
server.serve_forever()