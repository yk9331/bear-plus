# Bear+
A web-based writing application with real-time collaboration and Markdown syntax support for crafting and sharing notes. Group and find note easily with hashtag and full text search. Inspired by Bear note and HackMD.

[Homepage](https://bear-plus.yenchenkuo.com) [Intorduction](https://bear-plus.yenchenkuo.com/@bear-plus/features)

## Test User:

**Email:** bear@mail.com

**Password:** bearplus

(Public note are view only for anonymous user, please sign in to test collaboration features!)

## Table of Content
* [Features](#Features)
* [Technologies](#Technologies)
* [Contact](#Contact)

## Features
### Advanced Markup Editor
* **Text Style Rich Previews**
* **Markdown Compatible Syntax**
    * DONE: Heading, unordered list, ordered list, quote, code block
    * TODO: line separator, code, bold, italic, link, mark, etc.
* **JavaScript Code Syntax Highlight**
![](https://i.imgur.com/9VuAgCw.png)
* **In-line Drag and Drop Support for Images**
![](https://i.imgur.com/HLwGZpl.gif)
* **Note Information Dashboard**
![](https://i.imgur.com/lQa2Kva.png)

### Simple Note Organizing Tool
* **Categorize with Hashtags**
![](https://i.imgur.com/BgH2uIY.gif)
* **Pin Note on Top**
![](https://i.imgur.com/IBFCiKb.gif)
* **Find Note with Full-text Search**
* **Archive and Trash Support**


### Realtime Collaboration
* **Simultaneous editing without conflict**
* **Real-time Users' Cursor Display**
* **Auto Update and Save**
![](https://i.imgur.com/lYqlGeF.gif)
* **Share Note by Url**
* **Simple Note Permission Setting**
![](https://i.imgur.com/0xaP7J7.png)
* **Inline Comment**
![](https://i.imgur.com/b3neBQ0.gif)


## Technologies
### Architecture
![](https://i.imgur.com/z3ns9fa.png)

### Backend
* Environment: Linux + **Node.js**
* Framework: **Express.js**
* Real-time Data Transport: **Socket.io**
* User Authorization: **Passport.js + Express Session**
* Server-side Renderer: **EJS**

### Front-End 
* HTML
* CSS
* JavaScript + **AJAX** + **jQuery**
* Module Bundler: **Webpack**
* Rich-text Editor: **ProseMirror**

### Operational transformation
Implemented Operational Transformation System by **ProseMirror Collab** Module. 

### Database
* **RDS** + **MySQL**
* ORM: **Sequelize**
* Schema: 
![](https://i.imgur.com/wx0hN4T.png)

### Networking
* Protocol: **HTTP & HTTPs**
* SSL Certificate: **AWS Certificate Manager**
* DNS: **Route53**
* Proxy server: **Nginx**

### Tools
* CI/CD: **Jenkins + Docker**
* Test: **Mocha + Chai + Sinon**
* Linter: **ESLint**

### AWS Cloud Services
* **EC2** + **ELB**
* **S3** + **CloudFront**

## Contact
Yen-Chen Kuo

yenchenkuo9331@gmail.com
