# jdj-cert-worker
Background process for reading/generating certificate files and linking them to an Insphire SQL database

## setup

### Download and install redis
https://redis.io/download  

Install required software for PDF to image:

sudo apt-get install graphicsmagick imagemagick ghostscript poppler-utils

wkhtmltopfd:

sudo apt-get install xvfb libfontconfig wkhtmltopdf

git clone git@github.com:taffgear/jdj-cert-worker.git  
cd jdj-cert-worker  
npm install      
nano config.json    

```
{
  "server": {
    "port": 10000
  },
  "watchdir": "/watch/dir/for/files/",
  "pdfDir": "/pdf/dir/",
  "pdfDirFailed": "/pdf/failed/dir/",
  "pdfDirWin": "A:\\Windows\\dir",
  "api" : {
    "uri": "http://localhost:5000",
    "auth": {
      "username": "username",
      "password": "password"
    }
  }
}

```

### Start app

register OCR module:

cd node_modules/ocr
npm run register -- `email address`

cd ../../

DEBUG=* node app.js
