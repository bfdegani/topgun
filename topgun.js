// webcrawler para comparação de classes tarifárias de voos revenue x award
// Bruno Degani
// 2018-02-06

//MailSender
var mailcfg = require('./config/emailconfig.json');
var mailsender = require('./util/MailSender.js');

// events
var events = require('events');
var eventEmitter = new events.EventEmitter();
eventEmitter.setMaxListeners(1000);

//search config
var cfg = require('./config/config.json');
var revenue_url = cfg.revenue_url + '?' + cfg.revenue_params + '&' + cfg.commom_search_params;
var award_url =  cfg.award_url + '?' + cfg.award_params + '&' + cfg.commom_search_params;
var debug_mode = cfg.debug_mode;
var df = require('dateformat');

//debug_mode
function debugLog(s){
  if(debug_mode) console.log(s);
}

// limpa dados de execuções anteriores
var fs = require('fs');
try{
  fs.unlinkSync('flights.db');
} catch(fs_err){
  console.warn(fs_err.message);
}
try{
  fs.unlinkSync('results.db');
} catch(fs_err){
  console.warn(fs_err.message);
}

//base de dados em arquivo para processamento interno
var nedb = require('nedb');
var dbFlights = new nedb({
    filename: 'flights.db',
    autoload: true
});
var dbResults = new nedb({
    filename: 'results.db',
    autoload: true
});

//web crawler
var crawler = require('crawler');
var crawler_cfg = {
  maxConnections : 10,
  callback : function (error, res, done) {
      if(error) return;

      var award = res.request.uri.search.indexOf('passenger_useMyPoints=true') > 0;

      debugLog('------------------ voos ' + ( award ? 'award' : 'revenue' ));

      var $ = res.$;

      $('table[id=outbound_list_flight]').find('tr').each( function(i, tr_elem){
        if($(this).hasClass('flightType-Direct')){
          var flight_data = $(this).data();
          var flight = {
            'flightnumber' : flight_data.flightnumber,
            'operatedby' : flight_data.operatedby,
            'departureairportcode' : flight_data.departureairportcode,
            'arrivalairportcode' : flight_data.arrivalairportcode,
            'departuredate' : flight_data.departuredate,
            'award' : award,
            'searchdate': df(new Date(), 'yyyymmdd')
          };
          if(flight.operatedby == 'JJ') {
            debugLog(flight.flightnumber + '(' + flight.departureairportcode + ' -> ' + flight.arrivalairportcode + ')');
            flight.fares = [];
            $(this).find('td').each( function(j, td_elem) {
              var fares_data = $(this).data();
              if( fares_data != null && fares_data.cellFareclass != null && fares_data.cellFareclass != '') {
                var business = cfg.business_classes.indexOf(fares_data.cellFareclass.substring(0,1)) >= 0;
                flight.fares.push({
                  'cellFareFamily' : fares_data.cellFareFamily,
                  'cellFareclass' : fares_data.cellFareclass,
                  'cellPriceInReportingCurrency' : fares_data.cellPriceInReportingCurrency,
                  'business' : business
                });
                debugLog((business ? '(B)' : '(E)') + ', ' + fares_data.cellFareFamily + ", " + fares_data.cellFareclass + ", " + fares_data.cellPriceInReportingCurrency);
              }
            });

            //atualiza db com voo
            dbFlights.insert(flight, function(db_err){
                if(db_err) console.error(db_err);
            });
          }
      }
    });
    done();
  }
}

//comparação de tarifas revenue x award
function compareFares(callback){
  var results = 0;
  dbFlights.find({award:false}, function(err, flights){
    if(err) console.error(err);

    debugLog('------------------ comparando classes tarifárias');
    for( var i = 0; i < flights.length; i++) {
      dbFlights.find({'flightnumber': flights[i].flightnumber}).sort({'award': 1}).exec(function(err, f){
        if(err) console.error(err);
        debugLog('------------------');

        var fr = f[0]; // voo revenue

        var resultFlight = {
          flightnumber: fr.flightnumber,
          operatedby: fr.operatedby,
          departureairportcode: fr.departureairportcode,
          arrivalairportcode: fr.arrivalairportcode,
          departuredate: fr.departuredate,
          resultdate: df(new Date(), 'yyyymmdd'),
          revenuefares: fr.fares
        }

        var fa = f[1]; //voo award
        resultFlight.resultok = false;

        if(fa == null){ // não encontrou tarifa award pro voo selecionado
          debugLog(fr.flightnumber + '(' + fr.departureairportcode + ' -> ' + fr.arrivalairportcode + '): ' + ' não foram encontradas tarifas AWARD');
          resultFlight.awardfares = null;
          resultFlight.resultok = false;
        }
        else{
          //compara tarifas award e revenue
          var ok = true;

          for(var a = 0; a < fa.fares.length; a++){
            for(var r = 0; r < fr.fares.length; r++){
              if(fa.fares[a].business == fr.fares[r].business && fa.flightnumber == fr.flightnumber) {
                debugLog(fa.flightnumber + ' AWARD ' + (fa.business ? '(B)' : '(E)') + ': ' +
                fa.fares[a].cellFareFamily + ', ' + fa.fares[a].cellFareclass + ', ' +
                fa.fares[a].cellPriceInReportingCurrency + ', ' + (cfg.all_classes.indexOf(fa.fares[a].cellFareclass.substring(0,1))));
                debugLog(fr.flightnumber +' REVENUE ' + (fr.business ? '(B)' : '(E)') + ': ' +
                fr.fares[r].cellFareFamily + ', '+ fr.fares[r].cellFareclass + ', ' +
                fr.fares[r].cellPriceInReportingCurrency + ', ' + (cfg.all_classes.indexOf(fr.fares[r].cellFareclass.substring(0,1))));

                if(cfg.all_classes.indexOf(fa.fares[a].cellFareclass.substring(0,1)) > cfg.all_classes.indexOf(fr.fares[r].cellFareclass.substring(0,1))){
                  debugLog('NOK');
                  ok = false;
                  break;
                }
              }
            }
            if(ok){
              debugLog('OK');
              resultFlight.resultok = true;
              break;
            }
          }
        }

        dbResults.insert(resultFlight, function(db_err){
          if(db_err) console.error(db_err);
          eventEmitter.emit('resultAdded'); //notifica fim da comparação
        });

        debugLog(fr.flightnumber + '(' + fr.departureairportcode + ' -> ' + fr.arrivalairportcode + '): ' + (ok > 0 ? cfg.ok_msg : cfg.nok_msg));

      });
    }
    eventEmitter.on('resultAdded', function(){ //controla retorno das comparações de tarifas (executadas assíncronamente)
      results++;
      if(results == flights.length){
        callback();
      }
    });
  });
}

/* MAIN */
var c = new crawler(crawler_cfg);
cfg.flight_search_params.forEach(function(fsp) {
  debugLog('------------------ buscando voos');

  var dt = new Date();
  debugLog(fsp);
  dt.setHours(dt.getHours()+(24*fsp.days));

  var search_params = 'B_DATE_1=' + df(dt, 'yyyymmdd0000') + '&B_LOCATION_1=' + fsp.departureairportcode + '&E_LOCATION_1=' + fsp.arrivalairportcode;
  debugLog(search_params);

  //busca voos award
  debugLog('AWARD: ' + award_url + '&' + search_params);
  c.queue(award_url + '&' + search_params);
  debugLog('REVENUE: ' + revenue_url + '&' + search_params);
  c.queue(revenue_url + '&' + search_params);
});

c.on('drain', function(){
  compareFares(function(){
    dbResults.find({}).sort({'resultok': 1, 'departureairportcode': 1, 'arrivalairportcode': 1, 'departuredate': 1, 'flightnumber': 1}).exec(function(db_err, res){
      if(db_err) {
        console.error(db_err);
        return;
      }

      debugLog('------------------ resultados');

      var resultok = false;
      console.log(cfg.nok_msg);
      var output = "<body style=\"font-family: \'Courier New\'\">";

      if(!res[0].resultok) {
        output += "<p><strong>" + cfg.nok_msg + "</strong>";
      }

      for(var r = 0; r < res.length; r++){
        if(!resultok && res[r].resultok){
          console.log(cfg.ok_msg);
          output += "<body style=\"font-family: \'Courier New\'\">" +
                       "<p><strong>" + cfg.ok_msg + "</strong>";
          resultok = true;
        }
        var s = res[r].departureairportcode + '->' +
                  res[r].arrivalairportcode + ' (' +
                  res[r].departuredate + ') ' +
                  res[r].flightnumber;
        console.log(s);
        output +=  "<p>" + s;
      }
      output += "</body>"
      debugLog(output);
      mailcfg.options.html = output;
      mailsender.send(mailcfg.smtp, mailcfg.options, function(ms_err, ms_res){
        if(ms_err){
          console.error(ms_err);
        }
        else {
          debugLog('e-mail enviado com sucesso:\n' + ms_res.response);
        }
      });
    });
  });
});
