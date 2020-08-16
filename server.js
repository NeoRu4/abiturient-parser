const express = require('express')
const { response } = require('express');
const handlebars = require('express-handlebars');
const {Subject, forkJoin, of} = require('rxjs');
const { mergeMap } = require('rxjs/operators');
const timeout = require('connect-timeout');
const path = require('path');
const http = require('http');
const exam = require('./isHasExam.js');

const app = express()
const host = '192.168.1.2';
const port = 8080;
const blueUsers = ['179712']
const departamentId = ['670162757', '1868048610']

// ТОЛЬКО ДЛЯ МАГРИСТРАТУРЫ УРФУ

app.use(timeout('10s'));

app.engine('handlebars', handlebars({defaultLayout: 'main'}));
app.use(express.static(path.join(__dirname, '/static')));
app.set('views', './views');
app.set('view engine', 'handlebars');
app.set('trust proxy', true)

app.use(function (req, res, next) {
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    console.log(new Date().toLocaleString(), clientIp, req.method, req.originalUrl)
    next()
})

var subjectHome = new Subject()
app.get('/', (req, res) => subjectHome.next([req, res]));

subjectHome.pipe(
    mergeMap(args => {
        return forkJoin([
            of(args),
            exam.getRatingRtf(departamentId, blueUsers)
        ])
    })
).subscribe(([web, response]) => {
    let [req, res] = web;
    res.render('home', {
        content: response.body,
        lastTimeStamp: response.lastTimeStamp,
        css: ['table.css']
    });
},
error => {
    console.log(error)
})

app.use((err, request, response, next) => {
    console.log(err)
    response.status(500).render('error', {error: err});
})


const httpServer = http.createServer(app)
httpServer.listen(port, host, function () {
    console.log(`Server listens http://${host}:${port}`);
})