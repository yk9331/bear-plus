node { 
  stage('Clone'){
    sh 'docker exec -t bear-plus /bin/sh -c "git pull origin master"'
  }

  stage('Build') {
    sh 'docker exec -t bear-plus /bin/sh -c "npm install"'
    sh 'docker exec -t bear-plus /bin/sh -c "npm run build"'
  }

  stage('Restart'){
    sh 'docker exec -t bear-plus /bin/sh -c "pm2 restart bear-plus;"'
  }
}
