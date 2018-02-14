// webcrawler para comparação de classes tarifárias de voos revenue x award
// Bruno Degani
// 2018-02-06

// evnts
var events = require('events');
var eventEmitter = new events.EventEmitter();
eventEmitter.setMaxListeners(1000);

//config
var cfg = require('./config/config.json');
var revenue_url = cfg.revenue_url + '?' + cfg.revenue_params + '&' + cfg.commom_search_params;
var award_url =  cfg.award_url + '?' + cfg.award_params + '&' + cfg.commom_search_params;
var debug_mode = cfg.debug_mode;
var df = require('dateformat');

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

function compareFares(callback){
  var results = 0;
  dbFlights.find({award:true}, function(err, flights){
    if(err) console.error(err);

    debugLog('------------------ comparando classes tarifárias');
    for( var i = 0; i < flights.length; i++) {
      dbFlights.find({'flightnumber': flights[i].flightnumber}).sort({'award': -1}).exec(function(err, f){
        if(err) console.error(err);
        debugLog('------------------');

        var fa = f[0]; // voo award
        var fr = f[1]; // voo revenue
        var ok = 0;
        var nok = 0;

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
                nok++;
              }
              else{
                debugLog('OK');
                ok++;
              }
            }
          }
        }
        var resultFlight = {
          flightnumber: fa.flightnumber,
          operatedby: fa.operatedby,
          departureairportcode: fa.departureairportcode,
          arrivalairportcode: fa.arrivalairportcode,
          departuredate: fa.departuredate,
          revenuefares: fr.fares,
          awardfares: fa.fares,
          resultdate: df(new Date(), 'yyyymmdd'),
          resultok: ok > 0
        };

        dbResults.insert(resultFlight, function(db_err){
          if(db_err) console.error(db_err);
          eventEmitter.emit('resultAdded');
        });

        debugLog(fa.flightnumber + '(' + fa.departureairportcode + ' -> ' + fa.arrivalairportcode + '): ' + (ok > 0 ? cfg.ok_msg : cfg.nok_msg));

      });
    }
    eventEmitter.on('resultAdded', function(){
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
      if(db_err) console.error(db_err);
      debugLog('------------------ resultados');
      for(var r = 0; r < res.length; r++){
        console.log(res[r].departureairportcode + '->' + res[r].arrivalairportcode + ' (' + res[r].departuredate + ') ' + res[r].flightnumber + ': ' +
                    (res[r].resultok ? cfg.ok_msg : cfg.nok_msg));
      }
    });
  });
});
