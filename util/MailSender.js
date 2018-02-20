var nodemailer = require('nodemailer');

module.exports.send = function(smtpconfig, mailopt, callback){
  var transport = nodemailer.createTransport(smtpconfig);
  transport.sendMail(mailopt, callback);
}
