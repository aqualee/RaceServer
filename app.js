var express = require('express')
var session = require('express-session');
var RedisStore = require('connect-redis')(session);
var bodyParser = require('body-parser');
const login = require('./wxLogin/login');
const WXBizDataCrypt = require('./wxLogin/WXBizDataCrypt');
var redis = require('redis');
var mysql = require('mysql');


const co = require('co');
const constants= require('./constants');

const port =3000; 
const appId = 'wx70940596da02587d';
const appSecret= "3a443af56d1d669f392a2d086e6cf0a7";

var app = express()
var redisClient= redis.createClient(
    {
        host:'127.0.0.1',
        port:6379,
        ttl:24*60*60
    }
);

var pool  = mysql.createPool({
    connectionLimit : 10,
    host            : '127.0.0.1',
    port            : 3306,
    user            : 'raceUser',
    password        : 'a123456',
    database        : 'race'
  });


app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(session({
    store: new RedisStore({
        client :redisClient
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


var getDataFromDB = function(){

}

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


//取玩家数据
app.post('/user/getData',function(req,res){
    if(req.session && req.session.openId){
        var sql='select * from user where openId = ?';
        var args=[req.session.openId];
        pool.query(sql,args,function(err,res,field){
            if(err){
                //db 出错
                res.send(getParam(constants.CLIENT_STATUS_ERROR));
                return;
            }
            if(res && res.length > 0){
                var rs = res[0];
                req.session.isDBCreate = true;
                res.send(getParam(constants.CLIENT_STATUS_OK,rs.data));
            }else{
                //没有数据
                res.send(getParam(constants.CLIENT_STATUS_OK));
            }
        });
    }else{
        //没有session ，需要重新登入
        res.send(getParam(constants.CLIENT_STATUS_SESSION_EXPIRE));
    }
});

//保存玩家数据
app.post('/user/saveData',function(req,res){
    var jdata = req.body.data;
    if(req.session && req.session.openId){
        if(req.session.isDBCreate){
            //update
            var sql='update user set data = ? where id= ?';
            var args = [jdata,req.session.openId];
            pool.query(sql,args,function(err,res){
                if(err){
                    //db 出错
                    res.send(getParam(constants.CLIENT_STATUS_ERROR));
                    return;
                }                
                res.send(getParam(constants.CLIENT_STATUS_OK));
            });
        }else{
            //insert

            var sql = 'insert into user (openId,data,userInfo,lastLoginTime values (?,?,?,?))';
            var loginTime = Date.now();
            var userInfo = req.session.isAuth?req.session.userInfo:null;
            var args = [req.session.openId, jdata, userInfo , loginTime];
            pool.query(sql,args,function(err,res){
                if(err){
                    //db 出错
                    res.send(getParam(constants.CLIENT_STATUS_ERROR));
                    return;
                }
                req.session.isDBCreate = true;
                res.send(getParam(constants.CLIENT_STATUS_OK));
            });
        }
    }else{
        //没有session ，需要重新登入
        res.send(getParam(constants.CLIENT_STATUS_SESSION_EXPIRE));
    }
});

//看其他玩家数据
app.post('/user/saveData',function(req,res){
    var openId = req.body.openId;




});


 
const server =app.listen(port,()=>{console.log("server listening on port "+port)})




process.on('uncaughtException', function(err) {
	console.error(' Caught exception: ' + err.stack);
});


process.on('SIGINT', () => {
    redisClient.quit();
    server.close(() => {
        pool.end(
            (err)=>{
                console.log('Process terminated');
                process.exit(code=0);
            }
        )
    })
})