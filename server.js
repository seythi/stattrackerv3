var express = require('express');
var app = express();

var mngo = require('mongoose');

mngo.connect('mongodb://localhost/mongoosetest');
var bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true })); //deprecate?

var path = require('path');

app.use(express.static(path.join(__dirname, './client/static')));
app.use('/bower_components', express.static(__dirname +'/bower_components'));
app.use('/client', express.static(__dirname +'/client'));

//generate schemas
var StatSchema = new mngo.Schema({
	label: String,
	val: Number,
	cap: Number //TODO figure out use that is actually convenient
});
var PCSchema = new mngo.Schema({
	name: String,
	code: String,
	active: Boolean,
	stats: [StatSchema]
});
var CampaignSchema = new mngo.Schema({
	title: String,
	code: String,
	lock: Boolean,
	cstats: [StatSchema],
	players: [PCSchema]
});
mngo.model('Campaign', CampaignSchema);
var Campaign = mngo.model('Campaign'); 


/********************
*RESET BUTTON FOR DB*
********************/

// Campaign.remove({}, function(err) { console.log(err) });

/********************
*RESET BUTTON FOR DB*
********************/
function arrIndexByTag(arr, comparator, tagtype) //find an element in an array's index by its tag string (name, title, label)
{//return -1 if not found
	for(var foo = 0; foo < arr.length; foo++)
	{
		if(arr[foo][tagtype] == comparator)
		{
			return foo;
		}
	}
	return -1;
}

function loginhandler(socket, campaigns, data)//passed into the find campaign query, properly labels socket
{
	var campaignindex = arrIndexByTag(campaigns, data.title, 'title');
	if(campaignindex == -1)
	{
		socket.emit('result', {success: false, error: "campaign does not exist"});//createCampaign(data.title, data.code); //TODO create campaign with title and DM code
	}
	else
	{
		campaign = campaigns[campaignindex];//target campaign
		if(data.code == campaign.code)
		{
			socket.name = 'DM';
			socket.title = data.title;
			socket.campaignindex = campaignindex; 
			socket.playerindex = -1;
			socket.join(socket.title);
		    socket.emit('result', {success: true, path: 'view', name: "Campaign Stats", title: data.title});
		}
		else
		{
			var playerindex = arrIndexByTag(campaign.players, data.name, 'name')
			if(playerindex == -1){
			socket.emit('result', {success: false, error: "PC does not exist within campaign"});
			}
			else{
				socket.name = campaign.players[playerindex].name;
				socket.title = data.title;
				socket.campaignindex = campaignindex;
				socket.playerindex = playerindex;
				socket.join(socket.title);
		    	socket.emit('result', {success: true, path: 'view', name: socket.name, title: data.title});
			}
		}
	}
}
function registerhandler(socket, campaigns, data)//passed into the find campaign query, creates pc or campaign then labels socket
{
	if(data.name == '') {data.name = undefined;}
	var campaignindex = arrIndexByTag(campaigns, data.title, 'title');
	if(data.title == undefined || data.code == undefined){socket.emit('result', {success: false, error: "neither campaign or code can be empty"});}
	else if(campaignindex == -1 && data.name == undefined) //campaign dne, no char name given
	{
		var ncamp = new Campaign({title: data.title, code: data.code, lock: false, cstats: [], players: []});
		ncamp.save(function(err) {
		    if(err) {
		      socket.emit('result', {success: false, error: "Failed to save, contact administrator"});
		    } else {
		      socket.name = 'DM';
		      socket.playerindex = -1;
		      socket.title = data.title; 
		      socket.campaignindex = campaignindex;
		      socket.join(socket.title);
		      socket.emit('result', {success: true, path: 'view', name: "Campaign Stats", title: data.title});
		    }
		});
	}
	else if (campaignindex != -1 && data.name == undefined)
	{
		socket.emit('result', {success: false, error: "campaign already exists"});
	}
	else if (campaignindex == -1 && data.name != undefined)
	{
		socket.emit('result', {success: false, error: "campaign does not exist"});
	}
	else  //campaign exists, name present
	{
		campaign = campaigns[campaignindex];//target campaign
		if(campaign.lock || campaign.code == data.code)
		{
			socket.emit('result', {success: false, error: "campaign is locked, contact dm"});
		}
		else
		{
			var playerindex = arrIndexByTag(campaign.players, data.name, 'name');
			if(playerindex == -1){
				campaign.players.push({name: data.name, code: data.code, active: true, stats: []});

				campaign.save(function(err){
					if(err){
					    socket.emit('result', {success: false, error: "Failed to save, contact administrator"});
					}else
					{
						socket.name = data.name;
						socket.title = data.title;
						socket.campaignindex = campaignindex;
						socket.playerindex = playerindex;
						socket.join(socket.title);
						socket.emit('result', {success: true, path: 'view', name: data.name, title: data.title});
						socket.broadcast.to(socket.title).emit('reloader');
					}
				});

				
			}
			else{
				socket.emit('result', {success: false, error: "PC already exists in this campaign"});
			}
		}
	}
}

function populator (campaigns, socket){
	
	var campaign = campaigns[socket.campaignindex];//findcampaign(campaigns, socket.title);//campaigns[campaignindex];
	
	var data = {};
	data.players = campaign.players
	data.owner = socket.playerindex;
	data.dm = false;
	if(socket.name == 'DM')
	{
		data.dm = true;
		data.cstats = campaign.cstats;
	}
	socket.emit('dbINIT', data);
}
// Setting our Server to Listen on Port: 8000
var server = app.listen(8000, function() {
    console.log("listening on port 8000");
});
function addstathandler(socket, stat, campaigns, data){
	campaign = campaigns[socket.campaignindex];
	playerid = socket.playerindex;
	if(socket.name == 'DM')
	{
		campaign.cstats.push(stat);
	}
	else
	{
		campaign.players[playerid].stats.push(stat);
		data.owner = socket.playerindex;
		data.timestamp = new Date();
    	socket.broadcast.to(socket.title).emit('otheradded', data);
	}
	campaign.save();
}

function editstathandler(socket, pid, campaigns, data){
	campaign = campaigns[socket.campaignindex];
	playerid = pid;
	if(data.toggle == true)
	{
		if(pid!= -1){
			campaign.players[playerid].active = !campaign.players[playerid].active;
			socket.broadcast.to(socket.title).emit('reloader');
		}
		else
		{
			campaign.lock = !campaign.lock;
		}
	}
	else if(pid == -1)
	{
		campaign.cstats = data.stats; //data is entire prim array of emitter
	}
	else
	{
		campaign.players[playerid].stats = data.stats;
		data.owner = playerid;
		if(socket.name == 'DM'){socket.broadcast.to(socket.title).emit('reloader');}
    	else{socket.broadcast.to(socket.title).emit('otherupdated', data);}
	}
	campaign.save();
}



var io = require('socket.io').listen(server);


/**************************************************
*SOCKET PROPERTIES
*         name - socket's pc name or 'DM'
*        title - title of socket's campaign
*campaignindex - index of campaign in all campaigns
*  playerindex - index of pc within campaign
*         room - joined to room "title"
*****************************************************/

io.sockets.on('connection', function (socket) {
	socket.on('loggedin', function() //fires on load of view partial
	{ 
		if(!socket.name)//not actually logged in
		{
			socket.emit('fail');
		}else //logged in
		{
			Campaign.find({}, function(err, campaigns){populator(campaigns, socket);});//emits dbINIT
		}
	})
    socket.on('loginattempt', function(data){//fires on login button
    	Campaign.find({}, function(err, campaigns){
    		loginhandler(socket, campaigns, data);//emits result with errors or path to view, marks socket
    	});
    });
    socket.on('registerattempt', function(data){//fires on register button
    	//login/creator logic
    	Campaign.find({}, function(err, campaigns){//emits result with errors or path to view, broadcasts reloader, creates pc/campaign, marks socket
    		registerhandler(socket, campaigns, data);
        });
    }); 
    socket.on("statadd", function (data){//fires on pc adding stat
	  	if(data.val == undefined){data.val = 0}//convert empty to 0
	    var stat = {label: data.label, val: data.val, cap: data.val}; //build stat object
	    Campaign.find({}, function(err, campaigns){
    		addstathandler(socket, stat, campaigns, data);//adds stat object to pc of socket, broadcasts otheradded
    });
    
  });
  socket.on("statupdate", function (data){//fires on debounce expire of primaries
    Campaign.find({}, function(err, campaigns){
    	editstathandler(socket, socket.playerindex, campaigns, data);//edits socket's pc's stats (en mass for later cap operations)
    });
    
  });
  socket.on('dmupdate', function (data){//fires on dm edit of others
  	if(socket.name=='DM'){
  	    Campaign.find({}, function(err, campaigns){
    		editstathandler(socket, data.player, campaigns, data);//edits target's pc stats
    	});
  	}
  })
});
  
