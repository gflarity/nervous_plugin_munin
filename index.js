var fs = require('fs');
var net = require('net');
 
var config_path = require.resolve('./config.json');
var config = JSON.parse(fs.readFileSync( config_path ) );


module.exports = function( axon ) {


    var check_stats = function() {
        
        var tcp_connection;
        var state;
        var metric_categories = [];
        var fetch_time;
        var current_category;
        
        //note this is async, so everything below will get set first
        try { 
            tcp_connection = net.createConnection( config.port, config.host );
            tcp_connection.setEncoding( 'ascii' );
        } catch ( e ) {
         
            //apparently the dns lookup is sync? I got this:
            //Error: ECONNREFUSED, Could not contact DNS servers
            axon.emit( 'error',  e ); 
            return;
        }
        
        var on_connect = function() {
            
            //connected
            state = 'new_connection';
        };
        tcp_connection.on( 'connect', on_connect );
                
        var new_connection = function( data ) {           
            
            if ( data.indexOf( 'munin node' ) === -1 ) {                
                emit( 'error', 'bad handshake: ' + data );    
            }
            else {
                
                 tcp_connection.write( 'cap multigraph foo\n' );            
                //indicate we're waiting for a list data
                state = 'cap_response';    
            }
        };
        
        var cap_buffer;
        var cap_response = function( data ) {
            
            cap_buffer += data;
                            
            //still more to read
            if ( data.indexOf( '\n' ) !== -1 ) {                
                tcp_connection.write( 'list\n' );             
                state = 'list_response';
            }
            
        };
        
        
        var fetch_next = function() {

            var next_category = metric_categories.pop();

            if ( next_category ) {

                current_category = next_category;
                
                fetch_time = Math.round( new Date().getTime()/1000 );    
                tcp_connection.write( 'fetch ' + next_category + '\n' );  
                state = 'fetch_response';
                return;
            }            
        };
        
        //this function handles a processing the response to a list command
        var list_buffer = '';
        var list_response = function( data ) {
        
            list_buffer += data;
                            
            //still more to read
            if ( data.indexOf( '\n' ) !== -1 ) {
                                
                var lines = list_buffer.split( '\n' );
                var list = lines[0];                
                metric_categories = list.split( ' ' );
                debugger;
                fetch_next();
            }
        };
        
        //this function processes the response from a fetch request
        var fetch_buffer = '';
        var fetch_response = function( data ) {
        
            fetch_buffer += data
        
            //still more to read
            if ( data.indexOf( '.\n' ) === -1 ) {
                return;
            }
        
            
            var lines = fetch_buffer.split('\n');

            // ''
            lines.pop();
            // '.'
            lines.pop();

        
            //some categories contain 'multigraphs'...
            var multigraph = '';
            
            //loop through lines
            for ( var i = 0; i< lines.length; i++ ) {
                
                var line = lines[i];
                debugger;            
                //if we see a muligraph the values that value will be sub values
                var multigraph_match = line.match( /^multigraph (.*)/ )
                if (multigraph_match) {
                    multigraph = '.'+ multigraph_match[1];
                    continue;
                }
                
                var match = line.match( /(\w+).value (.+)/ )
                if ( match ) {
                    
                    var name = current_category + multigraph + '.' + match[1];
                    var value = match[2];
                    axon.emit( 'data', name, value, fetch_time );                    
                }                
            }
            
            fetch_buffer = '';
            fetch_next();
            
        };
        
        var on_data = function( data ) {
              
            switch ( state ) {
                
                case 'new_connection': 
                    new_connection( data );
                    break;
                    
                case 'cap_response':
                    
                    cap_response( data );
                    break;

                case 'list_response':
                    
                    list_response( data );
                    break;
                                    
                case 'fetch_response' :

                    fetch_response( data )
                    break;
                    
                default : 
                    
                    axon.emit( 'error', state );
                    tcp_connection.destroy();
            }
            
        };
        tcp_connection.on( 'data', on_data );
        
    };
    setInterval( check_stats, config.interval );
  
};