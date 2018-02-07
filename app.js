var app = require('./config/custom-express')();

var porta = 3000;

app.listen(porta, function(){
  console.log("Topgun rodando na porta " + porta);
});
