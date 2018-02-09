/*** FritzBox Presence Z-Way module *******************************************

Version: 0.7
(c) Lukas Frensel, 2018
-----------------------------------------------------------------------------
Author: Lukas Frensel
Description:
    Module to set presence switch according to connection state to FritzBox.
Home:
    https://github.com/Eweol/Zway-FritzBox-Presence/

******************************************************************************/

function FritzBoxPresence (id, controller) {
    // Call superconstructor first (AutomationModule)
    FritzBoxPresence.super_.call(this, id, controller);
    this.dev_presence = false;
    this.sessionID = "0000000000000000";
    this.device = "";
}

inherits(FritzBoxPresence, BaseModule);

_module = FritzBoxPresence;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

FritzBoxPresence.prototype.init = function (config) {
    FritzBoxPresence.super_.prototype.init.call(this, config);
	
    var self = this;
    self.device = self.config['deviceName'];

	self.controller.emit("cron.addTask", "fritzBoxPresence"+self.device+".poll", {
		minute: [0,59,self.config['requestInterval']],
		hour: null,
		weekDay: null,
		day: null,
		month: null
    });
    self.EventHandler = function()
    {
        self.checkPresence();
    }
    controller.on("fritzBoxPresence"+self.device+".poll",self.EventHandler);	
};

FritzBoxPresence.prototype.stop = function () {

    var self = this;
    self.logoutSessionID();		
    controller.off("fritzBoxPresence"+self.device+".poll",self.EventHandler);
    self.controller.emit("cron.removeTask", "fritzBoxPresence"+self.device+".poll");
    FritzBoxPresence.super_.prototype.stop.call(self);
};

// ----------------------------------------------------------------------------
// --- Module methods
// ----------------------------------------------------------------------------
//Check SessionID variable
FritzBoxPresence.prototype.checkPresence = function()
{
    if(this.sessionID == "0000000000000000")
    {
        this.getSessionID();
    }
    else
    {
        this.checkSessionID();
    }
}
//Get new SessionID from Fritz!Box
FritzBoxPresence.prototype.getSessionID = function()
{
    var url = "";
    var self = this;
    if(self.config['fritzIp'] == undefined)
    {
        url = "fritz.box/login_sid.lua";
    }
    else
    {
        url = self.config['fritzIp'] + "/login_sid.lua";
    }
    var req = {
        url: url,
        async: true,
        success: function(response) {
            self.sessionID = response.data.findOne("/SessionInfo/SID/text()");
            if (self.sessionID == "0000000000000000")
            {
                var challenge = response.data.findOne("/SessionInfo/Challenge/text()");
                url = url + "?username=" + self.config['fritzUser'] + "&response=" + self.GetResponse(challenge,self.config['fritzPw']);
                req=
                {
                    url:url,
                    async:true,
                    success: function(response)
                    {
                        self.sessionID = response.data.findOne("/SessionInfo/SID/text()");
                        self.GetData();
                    }
                }
                http.request(req);
            }
            else
            {
                self.GetData();
            }
			},
        error: function(response) {
            self.log("Can not make request: " + response.statusText);
            self.sessionID = "0000000000000000";
            } 
        };
    http.request(req);
}
//Check is SessionID valid if not get new one from Fritz!Box
FritzBoxPresence.prototype.checkSessionID = function()
{
    var url = "";
    var self = this;
    if(self.config['fritzIp'] == undefined)
    {
        url = "fritz.box/login_sid.lua?sid=" + self.sessionID;
    }
    else
    {
        url = self.config['fritzIp'] + "/login_sid.lua?sid=" + self.sessionID;
    }
    var req = {
        url: url,
        async: true,
        success: function(response) {
            self.sessionID = response.data.findOne("/SessionInfo/SID/text()");
            if (self.sessionID == "0000000000000000")
            {
                self.getSessionID();
            }
            else
            {
                self.GetData();
            }
			},
        error: function(response) {
            self.log("SessionIDCheck failed: " + response.statusText);
            self.sessionID = "0000000000000000";
            } 
        };
    http.request(req);
}
//Look for device registration on Fritz!Box
FritzBoxPresence.prototype.GetData = function()
{
    var url = "";
    var self = this;
    if (self.config['fritzIp'] == undefined)
    {
        url = "fritz.box/data.lua?sid=" + self.sessionID;
    }
    else
    {
        url = self.config['fritzIp'] + "/data.lua?sid=" + self.sessionID;
    }
    
    var req = 
    {
        url: url,
        async: true,
        success: function(response) 
        {
            var xml = JSON.parse(response.data);
            for(var i = 0; i < xml['data']['net']['devices'].length;i++)
            {
                if(xml['data']['net']['devices'][i]['name'] == self.device)
                {
                    self.dev_presence = true;
                    self.updatePresence();
                    return;
                }
            }
            self.dev_presence = false;
            self.updatePresence();
            return;
		},
        error: function(response)
        {
            self.log("Can not make request: " + response.statusText);
        } 
    };
    http.request(req);
}
//Update Presence-Device
FritzBoxPresence.prototype.updatePresence = function()
{
    var self = this;
    var vDev = controller.devices.get(self.config.device);
    if (vDev)
    {
        var newStatus = 'off';
	    if(self.dev_presence)
        {
            newStatus = 'on';
        }
        var actualStatus = vDev.get('metrics:level');
        if(actualStatus != newStatus )
		{               
            vDev.performCommand(newStatus);
        }
    }
    else
    {
        self.log("not updated");
    }
}
//End Fritzbox-Session
FritzBoxPresence.prototype.logoutSessionID = function()
{
    var url = "";
    var self = this;
    if(self.config['fritzIp'] == undefined)
    {
        url = "fritz.box/login_sid.lua?logout=1&sid=" + self.sessionID;
    }
    else
    {
        url = self.config['fritzIp'] + "/login_sid.lua?logout=1&sid=" + self.sessionID;
    }
    var req = {
        url: url,
        async: true,
        success: function(response) {
            self.sessionID = response.data.findOne("/SessionInfo/SID/text()");
			},
        error: function(response) {
            self.log("SessionLogout failed: " + response.statusText);
            self.sessionID = "0000000000000000";
            } 
        };
    http.request(req);
}
FritzBoxPresence.prototype.GetResponse = function(challenge, kennwort)
{
    return challenge + "-" + self.DecodeHex(crypto.md5(self.EncodeUTF16(challenge + "-" + kennwort)));
}
//Encode String in Unicode ByteArray
FritzBoxPresence.prototype.EncodeUTF16 = function(string) 
{
    var arr = [];
    for (var i = 0,j=0; i < 2* string.length; j++, i++) 
    {
        arr[i] = string.charCodeAt(j);
        i++;
        arr[i] = 0;
    }
    return arr;
}
//Decode ArrayBuffer to Hex-String
FritzBoxPresence.prototype.DecodeHex = function(arraybuffer) 
{ 
    var byteArray = new Uint8Array(arraybuffer);
    var hexParts = [];
    for(var i = 0; i < byteArray.length; i++)
    {
      var hex = byteArray[i].toString(16);
      var paddedHex = ('00' + hex).slice(-2);
      hexParts.push(paddedHex);
    }
    return hexParts.join('');
}