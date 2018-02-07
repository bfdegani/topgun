var revenue_url = "https://book.latam.com/TAM/dyn/air/booking/upslDispatcher?SITE=JJBKJJBK&LANGUAGE=BR&WDS_MARKET=BR&SERVICE_ID=2&COUNTRY_SITE=BR&WDS_DISABLE_REDEMPTION=&WDS_AWARD_CORPORATE_CODE=&MARKETING_CABIN=E&WDS_FORCE_SITE_UPDATE=TRUE&FORCE_OVERRIDE=TRUE&SO_SITE_QUEUE_OFFICE_ID=DONTQUEUE&SO_SITE_ADVANCED_CATEGORIES=FALSE&SO_SITE_MINIMAL_TIME=H3&SO_SITE_OFFICE_ID=SAOJJ08AW&SO_SITE_MIN_AVAIL_DATE_SPAN=H3&SO_SITE_ETKT_Q_AND_CAT=22C1&SO_SITE_BILLING_NOT_REQUIRED=FALSE&SO_SITE_ETKT_Q_OFFICE_ID=SAOJJ0120&WDS_DISABLE_REDEMPTION=&FORCE_OVERRIDE=TRUE&";

var award_url = "https://book.latam.com/TAM/dyn/air/redemption/availability?ENC=&utm_medium=buscador-passagens&LANGUAGE=BR&utm_source=site_multiplus&WDS_MARKET=BR&children=0&SERVICE_ID=1&ENCT=2&COUNTRY_SITE=BR&SITE=JJRDJJRD&passenger_useMyPoints=true&";

var search_params = "B_DATE_1=201804100000&B_DATE_2=&B_LOCATION_1=GRU&E_LOCATION_1=MIA&adults=1&children=0&infants=0&TRIP_TYPE=O";

var fs = require('fs');

var crawler = require('crawler');

//no pago filtrar code share acima de JJ8200
//classe é a 1a letra da fareclass
//classe no award deve ser menor ou igual que no revenue (a ordem das classes não é alfabética). e-mail vai passar a ordem

function searchFlights(url, params, callback){
  var crawler_cfg = {
    maxConnections : 10,
    callback : function (error, res, done) {
        console.log('\n#########');
        console.log(url+params);
        var $ = res.$;
        flights = [];
        $('table[id=outbound_list_flight]').find('tr').each( function(i, tr_elem){
          if($(this).hasClass('flightType-Direct')){
            var flight = $(this).data();
            if(flight != null && flight.flightnumber != null && flight.flightnumber.startsWith('JJ') && flight.flightnumber <= 'JJ8200' ) {
              console.log(flight.flightnumber);
              flight.fares = [];
              $(this).find('td').each( function(j, td_elem) {
                var fares = $(this).data();
                if( fares != null && fares.cellFareclass != null && fares.cellFareclass != '') {
                  flight.fares.push(fares);
                  console.log(fares.cellFareFamily + ", " + fares.cellFareclass + ", " + fares.cellPriceInReportingCurrency);
                }
              });
              flights.push(flight);
            }
          }
        });
      callback(error, flights);
      done();
    }
  }
  var c = new crawler(crawler_cfg);
  c.queue(url + params);
};

searchFlights(revenue_url, search_params, function(error, flights){
  if(error){
    console.log(error);
  }/*
  else {
    console.log(flights);
  }*/
});

searchFlights(award_url, search_params, function(error, flights){
  if(error){
    console.log(error);
  }/*
  else {
    console.log(flights);
  }*/
});
