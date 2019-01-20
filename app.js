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
        port:6379
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


var genSessionID = function (req,res,next){

    next();
}


app.use(bodyParser.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(genSessionID);
app.use(session({
   /* genid: function(req) {
        return genuuid() // use UUIDs for session IDs
      },*/
    store: new RedisStore({
        client :redisClient,
        ttl:3*60*60
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

/*app.get('/user/login',function (req,res){
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
});*/

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
        res.send(getParam(constants.CLIENT_STATUS_OK,{openId:req.session.openId}));
    }else{
        loginWX2(code,(err,ret)=>{
            if(err){
                console.log(err);
                res.send(getParam(constants.CLIENT_STATUS_ERROR,err));            
            }else{
                req.session.openId= ret.openId;
                req.session.session_key= ret.sessionKey;
                
                console.log(ret);
                res.send(getParam(constants.CLIENT_STATUS_OK,{openId:ret.openId}));
            }
        });   
    }    
});

//todo 在redis 里面设置这个人的邀请好友关系
function setInviteRelation(masterId, friendId,friendHead){

}

//todo redis 里面设置好友分享信息
function setShareRelation(masterId,friendId,friendHead){

}



var getUserInfo=function(openId){
        return new Promise(function(reslove,reject){

            var sql='select * from user where openId = ?';
            var args=[openId];
            pool.query(sql,args,function(err,res,field){
                if(err){
                    //db 出错
                    reject(err);
                    return;
                }
                reslove(res);
            });
    });
}


//取玩家数据
app.post('/user/getData',function(req,response){
    if(req.session && req.session.openId){
        getUserInfo(req.session.openId).then(function (res){
            if(res && res.length > 0){
                var rs = res[0];
                req.session.isDBCreate = true;
                response.send(getParam(constants.CLIENT_STATUS_OK,JSON.parse(rs.data)));
            }else{
                //没有数据
                response.send(getParam(constants.CLIENT_STATUS_OK));
                //判断是否有邀请
            }

        }).catch(function(err){
            //db 出错
            console.log(err);
            response.send(getParam(constants.CLIENT_STATUS_ERROR));
        });
    }else{
        //没有session ，需要重新登入
        response.send(getParam(constants.CLIENT_STATUS_SESSION_EXPIRE));
    }
});

//保存玩家数据
app.post('/user/saveData',function(req,res){
    var jdata = req.body.value;
    if(req.session && req.session.openId){
        var loginTime = Date.now();
        if(req.session.isDBCreate){
            //update
            var sql='update user set data = ? , lastLoginTime = ? where openId = ?';
            var args = [jdata,loginTime,req.session.openId];
            pool.query(sql,args,function(err){
                if(err){
                    //db 出错
                    console.log(err);
                    res.send(getParam(constants.CLIENT_STATUS_ERROR));
                    return;
                }                
                res.send(getParam(constants.CLIENT_STATUS_OK));
            });
        }else{
            //insert

            var sql = 'insert into user (openId,data,userInfo,lastLoginTime) values (?,?,?,?)';
            
            var userInfo = req.session.isAuth? JSON.stringify(req.session.userInfo):null;
            var args = [req.session.openId, jdata, userInfo , loginTime];
            pool.query(sql,args,function(err){
                if(err){
                    //db 出错
                    console.log(err);
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
app.post('/user/getUserInfo',function(req,res){
    var openId = req.body.openId;




});


function afterOneDay(before){
    var beforeDate = new Date(before);
    beforeDate.setHours(1);
    beforeDate.setMinutes(0);
    beforeDate.setSeconds(0);
    beforeDate.setMilliseconds(0);

    var now = new Date();
    now.setHours(1);
    now.setMinutes(0);
    now.setSeconds(0);
    now.setMilliseconds(0);

    return now > beforeDate;
}


//签到信息
app.post('/user/getSign',function(req,res){
    if(req.session && req.session.openId){
            //今天是哪一天
            //是否已经签到
            if(!req.session.signDay){
                req.session.signDay=0;            
            }

            if(!req.session.signDate){
                req.session.signDate = 0;         
            }


            var day;
            var isSign;
            if(afterOneDay(req.session.signDate)){
                if(req.session.signDay >= 7){
                    req.session.signDay = 0;
                }
                //过了一天
                day = req.session.signDay;
                isSign = false;
                //response.send(getParam(constants.CLIENT_STATUS_OK,{day:req.session.signDay,isSign:false }));
            }else{
                //签到过来
                day = req.session.signDay-1;
                isSign = true;
                //response.send(getParam(constants.CLIENT_STATUS_OK,{day:req.session.signDay-1,isSign:true }));
            }

            var retObj = [];
            for (var i=0;i<constants.SIGN_GOLD.length;i++ ){
                if(i<day){
                    retObj.push({sign_day:i,sign_is_receive:1,sign_gold:constants.SIGN_GOLD[i]});
                }else if(i == day){
                    retObj.push({sign_day:i,sign_is_receive:isSign?1:0,sign_gold:constants.SIGN_GOLD[i]});
                }else {
                    retObj.push({sign_day:i,sign_is_receive:0,sign_gold:constants.SIGN_GOLD[i]});
                }
            }
            
            res.send(getParam(constants.CLIENT_STATUS_OK,retObj));
    }else{
        res.send(getParam(constants.CLIENT_STATUS_SESSION_EXPIRE));
    }
});


//执行签到
app.post('/user/doSign',function(req,res){
    if(req.session && req.session.openId){
            if(afterOneDay(req.session.signDate)){
                //过了一天,可以签到
                req.session.signDay++;
                req.session.signDate = Date.now();
                res.send(getParam(constants.CLIENT_STATUS_OK));
            }else{
                //签到过了
                res.send(getParam(constants.CLIENT_STATUS_ERROR));
            }
    }else{
        res.send(getParam(constants.CLIENT_STATUS_SESSION_EXPIRE));
    }
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