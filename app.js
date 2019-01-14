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



app.use(
    function(req, res, next){
        next();
        var _end = res.end;
        var ended = false;

        res.end = function end(chunk, encoding) {

            if (ended) {
                return false;
              }
        
              ended = true;

            _end.call(res, chunk, encoding);


        }

       
    }
);




app.get('/', function (req, res) {
    req.session.userName='小李宝';
  res.send('Hello World')
})
 
app.listen(port,()=>{console.log("server listening on port "+port)})


process.on('uncaughtException', function(err) {
	console.error(' Caught exception: ' + err.stack);
});