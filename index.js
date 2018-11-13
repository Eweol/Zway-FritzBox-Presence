/*** FritzBox Presence Z-Way module *******************************************

Version: 1.2.1
(c) Lukas Frensel, 2018
-----------------------------------------------------------------------------
Author: Lukas Frensel
Description:
    Module to set presence switch according to connection state to FritzBox.
Home:
    https://github.com/Eweol/Zway-FritzBox-Presence/

ToDo:
    Support IPV6 for Fritz!Box-IP
    Support IPV6 for Device-IP

******************************************************************************/

function FritzBoxPresence (id, controller) {
    // Call superconstructor first (AutomationModule)
    FritzBoxPresence.super_.call(this, id, controller);
    this.dev_presence = false;
    this.sessionID = "0000000000000000";
    this.presenceDevice = "";
    this.fritzUser = "";
    this.fritzIp = "";
    this.fritzPw = "";
    this.type = "";
    this.interval = undefined;
    this.EventHandler = undefined;
}

inherits(FritzBoxPresence, BaseModule);

_module = FritzBoxPresence;

// ----------------------------------------------------------------------------
// --- Module instance initialized
// ----------------------------------------------------------------------------

FritzBoxPresence.prototype.init = function (config) {
    FritzBoxPresence.super_.prototype.init.call(this, config);
	
    var self = this;
    self.presenceDevice = self.config['presenceDevice'];
    self.fritzUser = self.config['fritzUser'];
    self.fritzIp = self.config['fritzIp'];
    self.fritzPw = self.config['fritzPw'];
    if(!self.CheckDeviceString())
    {
        return;
    }
    self.EventHandler = function()
    {
        self.checkPresence();
    }
    self.interval = setInterval(self.EventHandler,1000 * 60 * self.config['requestInterval']);
};

FritzBoxPresence.prototype.stop = function () {

    var self = this;
    self.logoutSessionID();	
    clearInterval(self.interval);
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
    if(self.fritzIp == undefined)
    {
        url = "fritz.box/login_sid.lua";
    }
    else
    {
        url = self.fritzIp + "/login_sid.lua";
    }
    var req = {
        url: url,
        async: true,
        success: function(response) {
            self.sessionID = response.data.findOne("/SessionInfo/SID/text()");
            if (self.sessionID == "0000000000000000")
            {
                var challenge = response.data.findOne("/SessionInfo/Challenge/text()");
                url = url + "?username=" + self.fritzUser + "&response=" + self.GetResponse(challenge);
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
    if(self.fritzIp == undefined)
    {
        url = "fritz.box/login_sid.lua?sid=" + self.sessionID;
    }
    else
    {
        url = self.fritzIp + "/login_sid.lua?sid=" + self.sessionID;
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
    if (self.fritzIp == undefined)
    {
        url = "fritz.box/data.lua";
    }
    else
    {
        url = self.fritzIp + "/data.lua";
    }
    var req = 
    {
        url: url,
        method: "POST",
        headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
        },
        data: {
            "sid" : self.sessionID,
            "lang" : "en",
            "page" : "netDev"
        },
        async: true,
        success: function(response) 
        {
            var xml = JSON.parse(response.data);
            for(var i = 0; i < xml['data']['active'].length;i++)
            {
                if(self.type == "mac" && xml['data']['active'][i]['mac'] == self.presenceDevice)
                {
                    self.dev_presence = true;
                    self.updatePresence();
                    return;
                }
                else if(self.type == "ipv6" != undefined && xml['data']['active'][i]['ipv6'] == self.presenceDevice)
                {
                    self.dev_presence = true;
                    self.updatePresence();
                    return;
                }
                else if(self.type == "ipv4" != undefined && xml['data']['active'][i]['ipv4'] == self.presenceDevice)
                {
                    self.dev_presence = true;
                    self.updatePresence();
                    return;
                }
                else if(self.type == "name" && xml['data']['active'][i]['name'] == self.presenceDevice)
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
            console.log(data);
            self.log("Can not make request: " + response.statusText);
        } 
    };
    http.request(req);
}
//Update Presence-Device
FritzBoxPresence.prototype.updatePresence = function()
{
    var self = this;
    var vDev;
    if(self.config["sensor_box"])
    {
        vDev = controller.devices.get(self.config.sensordevice);
    }
    else
    {
        vDev = controller.devices.get(self.config.switchdevice);
    }
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
    if(self.fritzIp == undefined)
    {
        url = "fritz.box/login_sid.lua?logout=1&sid=" + self.sessionID;
    }
    else
    {
        url = self.fritzIp + "/login_sid.lua?logout=1&sid=" + self.sessionID;
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
FritzBoxPresence.prototype.GetResponse = function(challenge)
{
    var self = this;
    return challenge + "-" + self.DecodeHex(crypto.md5(self.EncodeUTF16(challenge + "-" + self.fritzPw)));
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
//Check is device-string MAC-address or IP-address or device-name
FritzBoxPresence.prototype.CheckDeviceString = function() 
{ 
    self = this;
    if(self.presenceDevice != undefined)
    {
        if(self.checkIsMAC())
        {
            self.log(self.presenceDevice + " is mac address");
            self.type = "mac";
            return true;
        }
        else if(self.checkIsIPV6())
        {
            self.log(self.presenceDevice + " is ipv6 address");
            self.type = "ipv6";
            return true;
        }
        else if(self.checkIsIPV4())
        {
            self.log(self.presenceDevice + " is ipv4 address");
            self.type = "ipv4";
            return true;
        }
        else
        {
            self.log(self.presenceDevice + " is device name");
            self.type = "name"
            return true;
        }
    }
    return false;
}
//Check is MAC-address
FritzBoxPresence.prototype.checkIsMAC = function() 
{
    self = this;
    var blocks = self.presenceDevice.split(":");
    if(blocks.length === 6) {
      return blocks.every(function(block) {
        return block.length === 2;
      });
    }
    return false;
}
//Check is IPV4-address
FritzBoxPresence.prototype.checkIsIPV4 = function() 
{
    self = this;
    var blocks = self.presenceDevice.split(".");
    if(blocks.length === 4) {
      return blocks.every(function(block) {
        return parseInt(block,10) >=0 && parseInt(block,10) <= 255;
      });
    }
    return false;
}
//Check is IPV6-address
FritzBoxPresence.prototype.checkIsIPV6 = function() 
{
    //support for IPV6 came with later release
    return false;
}