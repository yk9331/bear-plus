node { 
  stage('Clone'){
    sh 'docker exec -t bear-plus /bin/sh -c "git pull origin develop"'
  }
  stage('Build') {
    sh 'docker exec -t bear-plus /bin/sh -c "apk --no-cache add --virtual builds-deps build-base python"'
    sh 'docker exec -t bear-plus /bin/sh -c "npm install"'
    sh 'docker exec -t bear-plus /bin/sh -c "npm rebuild bcrypt --build-from-source"'
    sh 'docker exec -t bear-plus /bin/sh -c "npm run build"'
  }
  stage('Restart'){
    sh 'docker exec -t bear-plus /bin/sh -c "pm2 restart bear-plus;"'
  }
}
