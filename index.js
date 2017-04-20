var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io').listen(http);

var credentials = {
	cookieSecret:"deswan"
}
//载入中间件
app.use(express.static('public'));
app.use(require('cookie-parser')(credentials.cookieSecret));
app.use(require('body-parser')());

//1.2.0
//io.sockets.sockets从对象变成了数组

var game = {
	start:false,	//游戏是否已经开始
	players:[],	
	users:{},	//_id:{name:_name,gaming:false,prepare:false}
	turninCounter:0,	//游戏轮次
	topic:[{title:'仙人掌',cue:'植物、3个字'},{title:'耳机',cue:'电子产品、2个字'}],
	topicChoice:0,
	rank:0,
	countdown:40,
	timeID:0,
	reset:function(){
		this.countdown=40;
		this.turninCounter=0;
		this.start=false;
		this.rank=0;
		this.players=[];
		clearTimeout(this.timeID);
	}
}


app.get('/',function(req,res){
	//判断是否登陆
	if(!req.cookies.name){
		res.redirect('/signin')
	}else{
		res.sendfile('views/index.html')
	}	
})

//登陆页
app.get('/signin',function(req,res){
	res.sendfile('views/signin.html')
})

//登陆处理
app.post('/signin',function(req,res){
	if((function(){
		for(var i in game.users){
			if(game.users[i].name===req.cookies.name){return true;}
		}
		return false;
	})()){	//判断该用户名是否已被注册
		res.redirect('/signin')
	}else{
		res.cookie('name',req.body.name);
		res.redirect('/');
	}
})




io.on('connection',function (socket) {
	console.log(socket.id)
	socket.on('error',function(data){
		console.log(data)
	})
	socket.on('join',function(name){	//登录时设置的用户名
		console.log(socket);
		console.log('join!')
		console.log('join!nickname:'+name+',id:'+socket.id)
		if(game.start){

		}else{
			socket.nickname=name;		//设置socket标识
			game.users[socket.id] = {name:name,gaming:false,prepare:false}	//添加入users对象
			io.sockets.emit('join',game.users);
		}
	})

	//断开连接：准备时->广播disconnection;游戏中->广播gameover
	socket.on('disconnect',function(){
		console.log(socket.nickname+':disconnect!')
		if(!game.users[socket.id]) return;
		if(!game.users[socket.id].gaming){
			delete game.users[socket.id];;
			io.sockets.emit('disconnection',game.users);
		}else{
			delete game.users[socket.id];
			game.reset();
			console.log('gaming disconnection')
			io.sockets.emit('gameover',0,socket.nickname);
		}

	})

	//准备动作
	socket.on('prepare',function(){
		game.users[socket.id].prepare=true;
		var allprepare = true;
		for(var key in game.users){		//检查是否全员prepare
			if(!game.users[key].prepare){
				allprepare=false;
				break;
			}
		}
		if(allprepare){
			game.start=true;
			//player:服务器端轮换用户用、客户端存储信息用
			for(var i in game.users){
				game.users[i].pIndex = game.players.length;	//0--game.users的属性数目-1

				//用数字代替ID作索引,方便轮换回合
				game.players[game.players.length]={id:i,name:game.users[i].name,score:0,correct:false}
			}

			//users列表状态改变
			for(var i in game.users){
				game.users[i].gaming=true;
				game.users[i].prepare=false;
			}
			io.sockets.emit('start',game.players);
			startturn();
		}else{
			socket.broadcast.emit('prepare',socket.id)
		}
	})

	//取消准备动作
	socket.on('unprepare',function(){
		game.users[socket.id].prepare=false;
		io.sockets.emit('unprepare',socket.id)
	})
	socket.on('down',function(pos){
		socket.broadcast.emit('down',pos);
	})
	socket.on('move',function(pos){
		socket.broadcast.emit('move',pos);
	})
	socket.on('up',function(pos){
		socket.broadcast.emit('up');
	})
	socket.on('answer',function(text){
		if(socket.id==game.players[game.turninCounter].id){	//非答题者：normal消息
			console.log('naomal')
			io.sockets.emit('normal',socket.nickname,text)
		}else{
			if(game.topic[game.topicChoice].title==text){	//答对
				var pIndex = game.users[socket.id].pIndex;
				if(!game.players[pIndex].correct){	//过滤已答对过的答题者
					io.sockets.emit('correct',pIndex,game.turninCounter,socket.nickname,game.rank);
					game.players[pIndex].correct=true;
					game.players[pIndex].score+=game.rank;
					game.players[game.turninCounter].score+=1;
					game.rank--;
					if(game.rank==0){
						turnend();
					}
				}else{
					io.sockets.emit('normal',socket.nickname,text)
				}
			}else{
				io.sockets.emit('normal',socket.nickname,text)
			}
		}
	})
	function turnend(){
		game.countdown=40;
		console.log("turnend")
		var addScore = game.players.length-1===game.rank ? -1 : 0;
		game.players[game.users[socket.id].pIndex].score+=addScore;
		io.sockets.emit('turnend',game.turninCounter,game.topic[game.topicChoice].title,addScore)
		game.turninCounter=(game.turninCounter+1)%game.players.length;
		setTimeout(startturn,5000)		

	}
	function startturn(){
		if(!game.start) return;
		console.log(game.users)
		game.rank=game.players.length-1;
		game.topicChoice = Math.floor((Math.random()*game.topic.length));

		//遍历；发送turnin和turnout
		for(key in io.sockets.sockets){
			io.sockets.sockets[key].correct=false;	//初始化correct属性
			if(key==game.players[game.turninCounter].id){
				io.sockets.sockets[key].emit('turnin',game.turninCounter,game.topic[game.topicChoice]);
			}else{
				io.sockets.sockets[key].emit('turnout',game.turninCounter,game.players[game.turninCounter].name);
			}
		}

		(function(){
			io.sockets.emit('countdown',game.countdown);
			if(game.countdown==20){
				io.sockets.emit('cue',game.topic[game.topicChoice].cue)
			}
			if(game.countdown==0) {
				turnend();
			}else {
				game.countdown--;
				setTimeout(arguments.callee, 1000);
			}
		})()
	}
})
http.listen(3000);


