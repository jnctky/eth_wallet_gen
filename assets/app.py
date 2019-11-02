#!/usr/bin/env python
import os.path
from flask import Flask, json, abort, request, Response, send_from_directory
#import pybitcointools
import bitcoin

app = Flask(__name__, static_url_path='', static_folder='static')
app.config.from_object(__name__)

def root_dir():  # pragma: no cover
    return os.path.abspath(os.path.dirname(__file__))

def get_file(filename):  # pragma: no cover
    try:
        src = os.path.join(root_dir(), filename)
        # Figure out how flask returns static files
        # Tried:
        # - render_template
        # - send_file
        # This should not be so non-obvious
        return open(src).read()
    except IOError as exc:
        return str(exc)

#@app.route('/')
#def default():
#    return "hello,cj"

@app.route('/', methods=['GET'])
def index():
    #content = get_file('assets/static/index.html')
    #return Response(content, mimetype="text/html")
    return app.send_static_file('index.html')

@app.route('/js/<path:path>')
def send_js(path):
    print path
    #return path
    return send_from_directory('static/js', path)

@app.route('/pushtx', methods=['POST'])
def pushtx():
    print request.json
    result = {}

    result = pushtransaction(request.json)
    if result:
        sendemail(request.json)

    return json.dumps(result)

def pushtransaction(json):
    result = {}
    try:
        print 'pushing transaction '+request.json['tx']
        # result = pybitcointools.pushtx(request.json['tx']) # FIXME uncomment debug
    except Exception as e:
        print e
        abort(500)

    return result

def sendemail(json):
    text = 'Thanks for participating in the Ethereum fundraiser. Attached is an encrypted backup of important transaction data.'
    msg = MIMEMultipart()
    msg['From'] = 'donotreply@fund.ethereum.org'
    msg['To'] = json['email']
    msg['Date'] = formatdate(localtime=True)
    msg['Subject'] = 'Ethereum Fundraiser backup'

    msg.attach( MIMEText(text) )

    part = MIMEBase('application', "octet-stream")
    part.set_payload( json['emailjson'] )
    Encoders.encode_base64(part)
    part.add_header('Content-Disposition', 'attachment; filename="%s"' % 'emailbackup.json')
    msg.attach(part)

    smtp = smtplib.SMTP('localhost')
    smtp.sendmail(msg['From'], msg['To'], msg.as_string())
    smtp.close()

@app.route('/unspent/<address>')
def gethistory(address):
    result = []
    try:
        txs = pybitcointools.history(address)
        for tx in txs:
            if not 'spend' in tx:
                result.append(tx)
    except Exception as e:
        raise
        abort(500)

    return json.dumps(result)

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=80, debug=True)
