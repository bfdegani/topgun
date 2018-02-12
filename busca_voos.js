// webcrawler para comparação de classes tarifárias de voos revenue x award
// Bruno Degani
// 2018-02-06

var all_classes = 'TGOQNSXVLMKHBYUZIDCJ';
var business_classes = 'UZIDCJ';

var fs = require('fs');

var nedb = require('nedb');

// limpa dados de execuções anteriores
var dbFileName = 'flights.db';
try{
  fs.unlinkSync(dbFileName);
}
catch(fs_err){
  console.log(fs_err);
}

var db = new nedb({
    filename: 'flights.db',
    autoload: true
});


var crawler = require('crawler');

var revenue_url = "https://book.latam.com/TAM/dyn/air/booking/upslDispatcher?SITE=JJBKJJBK&LANGUAGE=BR&WDS_MARKET=BR&SERVICE_ID=2&COUNTRY_SITE=BR&WDS_DISABLE_REDEMPTION=&WDS_AWARD_CORPORATE_CODE=&MARKETING_CABIN=E&WDS_FORCE_SITE_UPDATE=TRUE&FORCE_OVERRIDE=TRUE&SO_SITE_QUEUE_OFFICE_ID=DONTQUEUE&SO_SITE_ADVANCED_CATEGORIES=FALSE&SO_SITE_MINIMAL_TIME=H3&SO_SITE_OFFICE_ID=SAOJJ08AW&SO_SITE_MIN_AVAIL_DATE_SPAN=H3&SO_SITE_ETKT_Q_AND_CAT=22C1&SO_SITE_BILLING_NOT_REQUIRED=FALSE&SO_SITE_ETKT_Q_OFFICE_ID=SAOJJ0120&WDS_DISABLE_REDEMPTION=&FORCE_OVERRIDE=TRUE&";

var award_url = "https://book.latam.com/TAM/dyn/air/redemption/availability?ENC=&utm_medium=buscador-passagens&LANGUAGE=BR&utm_source=site_multiplus&WDS_MARKET=BR&children=0&SERVICE_ID=1&ENCT=2&COUNTRY_SITE=BR&SITE=JJRDJJRD&passenger_useMyPoints=true&";

var search_params = "B_DATE_1=201804100000&B_DATE_2=&B_LOCATION_1=CGH&E_LOCATION_1=SDU&adults=1&children=0&infants=0&TRIP_TYPE=O";

//no pago filtrar code share acima de JJ8200
//classe é a 1a letra da fareclass
//classe no award deve ser menor ou igual que no revenue (a ordem das classes não é alfabética). e-mail vai passar a ordem

function searchFlights(params, callback){
  console.log('------------------ buscando voos');
  console.log(search_params);

  var crawler_cfg = {
    maxConnections : 10,
    callback : function (error, res, done) {
        if(error) return;

        var award = res.request.uri.search.indexOf('passenger_useMyPoints=true') > 0;

        console.log('------------------ voos ' + ( award ? 'award' : 'revenue' ));

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
              'award' : award
            };
            if(flight.operatedby == 'JJ') {
              console.log(flight.flightnumber);
              flight.fares = [];
              $(this).find('td').each( function(j, td_elem) {
                var fares_data = $(this).data();
                if( fares_data != null && fares_data.cellFareclass != null && fares_data.cellFareclass != '') {
                  var business = business_classes.indexOf(fares_data.cellFareclass.substring(0,1)) >= 0;
                  flight.fares.push({
                    'cellFareFamily' : fares_data.cellFareFamily,
                    'cellFareclass' : fares_data.cellFareclass,
                    'cellPriceInReportingCurrency' : fares_data.cellPriceInReportingCurrency,
                    'business' : business
                  });
                  console.log((business ? '(B)' : '(E)') + ', ' + fares_data.cellFareFamily + ", " + fares_data.cellFareclass + ", " + fares_data.cellPriceInReportingCurrency);
                }
              });

              //atualiza db com voo
              db.insert(flight, function(db_err){
                  if(db_err) {
                    console.log('## erro em db.insert');
                    console.log(db_err);
                  }
              });
            }
        }
      });

      done();
    }
  }

  var c = new crawler(crawler_cfg);
  //busca voos award
  c.queue(award_url + params);
  c.queue(revenue_url + params);

  c.on('drain', function(){
    callback();
  })
};


searchFlights(search_params, function(){
   db.find({award:true}, function(err, flights){
     if(err) {
       console.log(err);
     }
     console.log('------------------ comparando classes tarifárias');

     var i = 0;
     for( i = 0; i < flights.length; i++) {
       db.find({'flightnumber': flights[i].flightnumber}).sort({'award': -1}).exec(function(err, f){
         if(err) {
           console.log('## erro em db.find');
           console.log(err);
         }
         else{
           console.log('------------------');

           var fa = f[0]; // voo award
           var fr = f[1]; // voo revenue

           var ok = 0;
           var nok = 0;

           for(var a = 0; a < fa.fares.length; a++){
             for(var r = 0; r < fr.fares.length; r++){
               if(fa.fares[a].business == fr.fares[r].business && fa.flightnumber == fr.flightnumber) {
                 console.log(fa.flightnumber + ' AWARD ' + (fa.business ? '(B)' : '(E)') + ': ' +
                  fa.fares[a].cellFareFamily + ', ' + fa.fares[a].cellFareclass + ', ' +
                  fa.fares[a].cellPriceInReportingCurrency + ', ' + (all_classes.indexOf(fa.fares[a].cellFareclass.substring(0,1))));
                 console.log(fr.flightnumber +' REVENUE ' + (fr.business ? '(B)' : '(E)') + ': ' +
                  fr.fares[r].cellFareFamily + ', '+ fr.fares[r].cellFareclass + ', ' +
                  fr.fares[r].cellPriceInReportingCurrency + ', ' + (all_classes.indexOf(fr.fares[r].cellFareclass.substring(0,1))));

                 if(all_classes.indexOf(fa.fares[a].cellFareclass.substring(0,1)) > all_classes.indexOf(fr.fares[r].cellFareclass.substring(0,1))){
                   console.log('NOK');
                   nok++;
                 }
                 else{
                   console.log('OK');
                   ok++;
                 }
               }
             }
           }
           if(ok == 0 && nok >0){ //não foi encontrada nenhuma tarifa mais baixa em pontos
             console.log(fa.flightnumber + ': NOK - encontradas apenas tarifas AWARD e classes mais caras que as tarifas REVENUE');
           }
           else {
             console.log(fa.flightnumber + ': OK - encontrada pelo menos uma tarifa AWARD de classe igual ou mais barata que as tarifas REVENUE');
           }
         }
       });
     };
   });
});
