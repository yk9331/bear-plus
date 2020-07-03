node {
  stage('Build') {
    sh 'docker run --rm -d -p 5000:5000 -v ${WORKSPACE}:/var/app -v /home/server-setup/bear-plus/.env:/var/app/.env -w /var/app node:12-alpine /bin/sh -c "npm install; npm install -g pm2; pm2-runtime app.js --name bear-plus"'
  }
}