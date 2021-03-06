var express = require('express')
var session = require('express-session');
var RedisStore = require('connect-redis')(session);
var bodyParser = require('body-parser');
const login = require('./wxLogin/login');
const WXBizDataCrypt = require('./wxLogin/WXBizDataCrypt');
var redis = require('redis');
var mysql = require('mysql');
var fs = require('fs');
var https = require('https');

try {
    var privateKey  = fs.readFileSync('/ssl/1878801_www.joydz.com.key', 'utf8');
    var certificate = fs.readFileSync('/ssl/1878801_www.joydz.com.pem', 'utf8');
} catch (error) {
    console.log(error);
}

var credentials = {key: privateKey, cert: certificate};



//const co = require('co');
const constants= require('./constants');

const port =3000; 
const sslPort= 3001;
const appId = 'wx70940596da02587d';
const appSecret= "7bd65799b6e303cbcc942a3e09eca98b";

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
        ttl:24*60*60
    }),
    secret: 'keyboard cat',
    resave: false,
    cookie: { secure: false },
    saveUninitialized: false
}));


var shareSwitch = 0;
redisClient.hget(constants.SYSTEM_CONFIG_KEY,"shareSwitch",(err,v)=>{
    shareSwitch = v?parseInt(v):0;
    console.log("shareSwitch is:"+shareSwitch);
})


if (app.get('env') === 'production') {


}

/**
 * 
 * @param {*} status 
 * @param {*} data 
 */
var getParam = function(status,data={},msg=null){
    if(data === undefined){
        data = {};
    }
    return {status:status,result:data,msg:msg};
}


/*var loginWX2 = co.wrap(function*  loginWX(code,callback){

    var obj;
    try{
        obj = yield login({ appId, appSecret, code });

    }catch(err){
        
        callback(err);
        return;
    }

    callback(null,obj);
});*/



app.get('/',function (req,res){
    res.send("server is ok");
});

app.post('/user/login',function (req,res){
    var msg = req.body;
    var code = msg.code; 
    //console.log(JSON.stringify(msg));

    if(req.session.isAuth){
        res.send(getParam(constants.CLIENT_STATUS_OK,{openId:req.session.userInfo.openId,function_privilege:shareSwitch}));
        setInviteRelation(msg.invite_type,msg.user_invite_uid,req.session.openId,req.session.userInfo.avatarUrl,req.session.userInfo.nickName);
    }else{
        login({appId, appSecret,code}).then(function(ret){
            req.session.openId= ret.openId;
            var sessionKey = req.session.session_key= ret.sessionKey;
            
            var iv = decodeURIComponent(msg.iv);
            var encryptData = decodeURIComponent(msg.encrypted_data);
            const wxBiz = new WXBizDataCrypt(appId, sessionKey);
            const userInfo = wxBiz.decryptData(encryptData, iv);
            req.session.userInfo = userInfo;
            req.session.isAuth = true;

            res.send(getParam(constants.CLIENT_STATUS_OK,{openId:userInfo.openId,function_privilege:shareSwitch}));
            setInviteRelation(msg.invite_type,msg.user_invite_uid,req.session.openId,req.session.userInfo.avatarUrl,req.session.userInfo.nickName);
        }).catch(function(err){
            console.log(err);
            res.send(getParam(constants.CLIENT_STATUS_ERROR,err));
        });
    }
});

// 在微信环境下可以取到     console.log(xhr.http.getResponseHeader("set-cookie"));

app.post('/user/weakLogin',function (req,res){
    var msg = req.body;
    var code = msg.code;
    //console.log(JSON.stringify(msg));

    if(req.session.openId){
        res.send(getParam(constants.CLIENT_STATUS_OK,{openId:req.session.openId,function_privilege:shareSwitch}));
        setInviteRelation(msg.invite_type,msg.user_invite_uid,req.session.openId);
    }else{
        login({appId, appSecret,code}).then(function(ret){
            req.session.openId= ret.openId;
            req.session.session_key= ret.sessionKey;
            
            //console.log(ret);
            res.send(getParam(constants.CLIENT_STATUS_OK,{openId:ret.openId,function_privilege:shareSwitch}));
            setInviteRelation(msg.invite_type,msg.user_invite_uid,req.session.openId);

        }).catch(function(err){
            console.log(err);
            res.send(getParam(constants.CLIENT_STATUS_ERROR,err));
        });
    } 
});


const INVITE_KEY= "invite";
const FRIEND_HELP_KEY="friendHelp";
const DAILY_SIGN = "DAILY_SIGN";


//在redis 里面设置这个人的邀请好友关系
function setInviteRelation(invite_type, masterId, friendId,friendHead,friendName){
   // console.log(invite_type,masterId,friendId);
    if(invite_type == null || masterId == null){
        return;
    }

    if(invite_type =="invite_help"){
        redisClient.hget("openId:"+masterId ,FRIEND_HELP_KEY,(err,v)=>{
            v = JSON.parse(v) || {};
            if(v.hasOwnProperty(friendId)){            
                if(v[friendId][1] == false && afterOneDay(v[friendId][0]) ){
                    v[friendId][1] = true;   
                    redisClient.hset("openId:"+masterId,FRIEND_HELP_KEY,JSON.stringify(v),redis.print);
                }            
            }else{
                v[friendId] = [0,true,friendHead,friendName]; //上次领奖的时间戳,是否领过,头像,名字
                redisClient.hset("openId:"+masterId,FRIEND_HELP_KEY,JSON.stringify(v),redis.print);
            }        
       })
    }else{
    /*  getUserInfo(friendId).then((res)=>{
                if(res && res.length > 0){
                }else{
    
                }
            }
            )*/
            
            redisClient.hget("openId:"+masterId ,INVITE_KEY,(err,v)=>{
                v = JSON.parse(v) || {};
                if(v.hasOwnProperty(friendId)){
                    console.log("inviteid has already save");                       
                }else{
                    v[friendId] = [friendHead,friendName,1]; //头像
                    redisClient.hset("openId:"+masterId,INVITE_KEY,JSON.stringify(v),redis.print);
                }

        })
    }
}


//获取邀请好友列表
app.post('/invite/getListByInvite',function (req,res){
    if(req.session.openId==null){
        res.send(getParam(constants.CLIENT_STATUS_SESSION_EXPIRE,{},"session 过期"));
        return;
    }
    redisClient.hget("openId:"+req.session.openId ,INVITE_KEY,(err,v)=>{
        v = JSON.parse(v) || {};
        var  arr = [];
        for(var k in v){
                arr.push({invite_id:k,
                    user_avatar_url:v[k][0],
                    invite_is_receive:v[k][2],
                    user_nickname:v[k][1],
                    invite_diamond:300
                });
        }
        res.send(getParam(constants.CLIENT_STATUS_OK,arr));
    });
});


//邀请好友领奖
app.post('/invite/getInviteAward',function (req,res){
    if(req.session.openId==null){
        res.send(getParam(constants.CLIENT_STATUS_SESSION_EXPIRE,{},"session 过期"));
        return;
    }
    let inviteId = req.body.invite_id;
    redisClient.hget("openId:"+req.session.openId ,INVITE_KEY,(err,v)=>{
        v = JSON.parse(v) || {};
        if(inviteId in v){
            //delete v[inviteId];
            if(v[inviteId][2] == 1){
                v[inviteId][2] = 2;
                res.send(getParam(constants.CLIENT_STATUS_OK));
            }else{
                //已经领取过
                res.send(getParam(constants.CLIENT_STATUS_ERROR));
            }

            redisClient.hset("openId:"+req.session.openId,INVITE_KEY,JSON.stringify(v),redis.print);
            return;
        }
        res.send(getParam(constants.CLIENT_STATUS_ERROR));
    });
});



//获取助力好友
app.post('/invite/getListByFriendAssist',function (req,res){
    if(req.session.openId==null){
        res.send(getParam(constants.CLIENT_STATUS_SESSION_EXPIRE,{},"session 过期"));
        return;
    }
    redisClient.hget("openId:"+req.session.openId ,FRIEND_HELP_KEY,(err,v)=>{
        v = JSON.parse(v) || {};
        var  arr = [];
        var i=0;
        for(var k in v){
            if(v[k][1]){
                arr.push({
                    invite_id:k,
                    user_avatar_url:v[k][2],
                    user_nickname:v[k][3]
                });
                i++;
                if(i>=3){
                    break;
                }
            }
        }

        req.session.friendHelpParam= arr;
        res.send(getParam(constants.CLIENT_STATUS_OK,arr));
    });
});


app.post('/invite/getFriendAward',function (req,res){
    if(req.session.openId==null){
        res.send(getParam(constants.CLIENT_STATUS_SESSION_EXPIRE,{},"session 过期"));
        return;
    }

    if(req.session.friendHelpParam == null){
        res.send(getParam(constants.CLIENT_STATUS_ERROR,{},"参数未找到"));
        return;
    }
    if(req.session.friendHelpParam.length<3){
        res.send(getParam(constants.CLIENT_STATUS_ERROR,{},"好友数量不够"));
        return;
    }

    redisClient.hget("openId:"+req.session.openId ,FRIEND_HELP_KEY,(err,v)=>{
        v = JSON.parse(v) || {};
        for(var item of req.session.friendHelpParam){
            v[item.invite_id][1] = false;
            v[item.invite_id][0] = Date.now();            
        }
        
        res.send(getParam(constants.CLIENT_STATUS_OK));
        //清理一下,防止内存泄漏
      /*  for(var k in v){
            if(v[k][1]== false && afterOneDay(v[k][0]))
            {
                delete v[k];
            }
        }*/

        redisClient.hset("openId:"+req.session.openId,FRIEND_HELP_KEY,JSON.stringify(v),redis.print);
    });
});



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
                req.session.isDBCreate = false;
                //没有数据
                response.send(getParam(constants.CLIENT_STATUS_OK,{userInfo:null}));
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

            redisClient.hget("openId:"+req.session.openId ,DAILY_SIGN,(err,v)=>{
                v = JSON.parse(v) || {};
                if(v.signDay == null){
                    v.signDay=0;            
                }
    
                if(v.signDate == null){
                    v.signDate = 0;         
                }
    
    
                var day;
                var isSign;
                if(afterOneDay(v.signDate)){
                    if(v.signDay >= 7){
                        v.signDay = 0;
                    }
                    //过了一天
                    day = v.signDay;
                    isSign = false;
                }else{
                    //签到过来
                    day = v.signDay-1;
                    isSign = true;
                }
    
                var retObj = [];
                for (var i=0;i<constants.SIGN_GOLD.length;i++ ){
                    if(i<day){
                        retObj.push({sign_day:i,sign_is_receive:2,sign_gold:constants.SIGN_GOLD[i]});
                    }else if(i == day){
                        retObj.push({sign_day:i,sign_is_receive:isSign?2:1,sign_gold:constants.SIGN_GOLD[i]});
                    }else {
                        retObj.push({sign_day:i,sign_is_receive:0,sign_gold:constants.SIGN_GOLD[i]});
                    }
                }
                
                res.send(getParam(constants.CLIENT_STATUS_OK,retObj));
                redisClient.hset("openId:"+req.session.openId,DAILY_SIGN,JSON.stringify(v),redis.print);
            });
                   
    }else{
        res.send(getParam(constants.CLIENT_STATUS_SESSION_EXPIRE));
    }
});


//执行签到
app.post('/user/doSign',function(req,res){
    if(req.session && req.session.openId){
        redisClient.hget("openId:"+req.session.openId ,DAILY_SIGN,(err,v)=>{
            v = JSON.parse(v) || {};
            if(v.signDay == null){
                v.signDay=0;            
            }
            if(v.signDate == null){
                v.signDate = 0;         
            }

            if(afterOneDay(v.signDate)){
                //过了一天,可以签到
                v.signDay++;
                v.signDate = Date.now();
                res.send(getParam(constants.CLIENT_STATUS_OK));
                redisClient.hset("openId:"+req.session.openId,DAILY_SIGN,JSON.stringify(v),redis.print);
            }else{
                //签到过了
                res.send(getParam(constants.CLIENT_STATUS_ERROR));
            }
        });
    }else{
        res.send(getParam(constants.CLIENT_STATUS_SESSION_EXPIRE));
    }
});


/*app.get('/sys/getSW',function (req,res){
   redisClient.hget(constants.SYSTEM_CONFIG_KEY,"shareSwitch",(err,v)=>{
        v = v?parseInt(v):0;
        res.send(getParam(constants.CLIENT_STATUS_OK,{open:v}));
   })
});*/

app.get('/sys/setSW',function (req,res){

    if(req.query.a == "1"){
        redisClient.hset(constants.SYSTEM_CONFIG_KEY,"shareSwitch",1);
        shareSwitch = 1;
        res.send("分享打开");
        return;

    }else if(req.query.a == "0"){
        redisClient.hset(constants.SYSTEM_CONFIG_KEY,"shareSwitch",0);
        shareSwitch = 0;
        res.send("分享关闭");
        return;
    }
    res.send("参数错误");


});

 
const server =app.listen(port,()=>{console.log("http server listening on port "+port)})

const sslServer = https.createServer(credentials, app).listen(sslPort,()=>{console.log("https server listening on port "+sslPort)});




process.on('uncaughtException', function(err) {
	console.error(' Caught exception: ' + err.stack);
});


process.on('SIGINT', () => {
    redisClient.quit();
    sslServer.close(()=>{
        server.close(() => {
            pool.end(
                (err)=>{
                    console.log('Process terminated');
                    process.exit(code=0);
                }
            )
        })
    });
   
})