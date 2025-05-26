# api/webhook.py
from flask import Flask, request

app = Flask(__name__)

@app.route('/', methods=['GET', 'POST'])
def webhook():
    if request.method == 'POST':
        return "OK"
    return "ZettiBot está funcionando!"

# Handler para Vercel
def handler(request):
    return app(request)