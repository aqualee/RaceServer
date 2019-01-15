var express = require('express')
var session = require('express-session');
var RedisStore = require('connect-redis')(session);
var bodyParser = require('body-parser');
const login = require('./wxLogin/login');
const WXBizDataCrypt = require('./wxLogin/WXBizDataCrypt');

const co = require('co');
const constants= require('./constants');

const port =3000; 
const appId = 'wx70940596da02587d';
const appSecret= "3a443af56d1d669f392a2d086e6cf0a7";

var app = express()
app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(session({
    store: new RedisStore({
        host:'127.0.0.1',
        port:6379,
        ttl:24*60*60
    }),
    secret: 'keyboard cat',
    resave: false,
    cookie: { secure: false },
    saveUninitialized: false
}));



if (app.get('env') === 'production') {


}

/**
 * 
 * @param {*} status 
 * @param {*} data 
 */
var getParam = function(status,data){
    if(data === undefined){
        data = {};
    }
    return {status:status,result:data};
}


var loginWX2 = co.wrap(function*  loginWX(code,callback){

    var obj;
    try{
        obj = yield login({ appId, appSecret, code });

    }catch(err){
        
        callback(err);
        return;
    }

    callback(null,obj);
});


app.get('/user/login',function (req,res){
    //var msg = req.body;
    var code = 222;    
    
    loginWX2(code,(err,ret)=>{
        if(err){
            console.log(err);
            res.json(err);            
        }else{
            req.session.openId= ret.openId;

            console.log(ret);
        }
    });   
});

app.post('/user/login',function (req,res){
    var msg = req.body;
    var code = msg.code; 

    if(req.session.isAuth){
        res.send(getParam(constants.CLIENT_STATUS_OK,{openId:req.session.userInfo.openId}));
    }else{
        loginWX2(code,(err,ret)=>{
            if(err){
                console.log(err);
                res.send(getParam(constants.CLIENT_STATUS_ERROR,err));       
            }else{
                req.session.openId= ret.openId;
                var sessionKey = req.session.session_key= ret.sessionKey;
                
                var iv = decodeURIComponent(msg.iv);
                var encryptData = decodeURIComponent(msg.encrypted_data);
                const wxBiz = new WXBizDataCrypt(appId, sessionKey);
                const userInfo = wxBiz.decryptData(encryptData, iv);
                req.session.userInfo = userInfo;
                req.session.isAuth = true;
    
                res.send(getParam(constants.CLIENT_STATUS_OK,{openId:userInfo.openId}));
    
            }
        });
    }   
});

// 在微信环境下可以取到     console.log(xhr.http.getResponseHeader("set-cookie"));

app.post('/user/weakLogin',function (req,res){
    var msg = req.body;
    var code = msg.code;

    if(req.session.openId){
        res.send(getParam(constants.CLIENT_STATUS_OK));
    }else{
        loginWX2(code,(err,ret)=>{
            if(err){
                console.log(err);
                res.send(getParam(constants.CLIENT_STATUS_ERROR,err));            
            }else{
                req.session.openId= ret.openId;
                req.session.session_key= ret.sessionKey;
                
                console.log(ret);
                res.send(getParam(constants.CLIENT_STATUS_OK));
            }
        });   
    }    
});


 
app.listen(port,()=>{console.log("server listening on port "+port)})


process.on('uncaughtException', function(err) {
	console.error(' Caught exception: ' + err.stack);
});