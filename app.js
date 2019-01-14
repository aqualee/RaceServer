var express = require('express')
var session = require('express-session');
var RedisStore = require('connect-redis')(session);
const port =3000; 

var app = express()
app.use(session({
    store: new RedisStore({
        host:'127.0.0.1',
        port:6379,
        ttl:1*60*60
    }),
    secret: 'keyboard cat',
    resave: false
}));


if (app.get('env') === 'production') {


}




app.post('/user/login',function (req,res){
    var msg = req.body;
    var code = msg.code;
    res.json({code:code});
});


app.post('/user/weakLogin',function (req,res){
    var msg = req.body;
    var code = msg.code;
    res.json({code:code});
});


 
app.listen(port,()=>{console.log("server listening on port "+port)})


process.on('uncaughtException', function(err) {
	console.error(' Caught exception: ' + err.stack);
});