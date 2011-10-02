/*
 * File: lookout.js
 *   LookOut Mozilla MailNews Attachments Javascript Overlay for TNEF
 *
 * Copyright:
 *   Copyright (C) 2007-2010 Aron Rubin <arubin@atl.lmco.com>
 *
 * About:
 *   Benevolently hijack the Mozilla mailnews attachment list and expand all
 *   Transport Neutral Encapsulation Format (TNEF) encoded attchments. When
 *   TNEF attachments are opened, decode them.
 */

/* ***** BEGIN LICENSE BLOCK *****
 *   Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 * 
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is LookOut.
 *
 * The Initial Developer of the Original Code is
 * Aron Rubin.
 * Portions created by the Initial Developer are Copyright (C) 2007-2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 * 
 * ***** END LICENSE BLOCK ***** */


// How long we should wait for window initialization to finish
const LOOKOUT_WAIT_MAX = 10;
const LOOKOUT_WAIT_TIME = 100;

const LOOKOUT_PREF_PREFIX = "extensions.lookout.";

var lookout = {
  log_msg: function lo_log_msg( msg, level ) {
    if( (level == null ? 9 : level) <= debugLevel ) {
      var cs = Components.classes["@mozilla.org/consoleservice;1"].getService(Components.interfaces.nsIConsoleService);
      cs.logStringMessage( msg );
    }
  },
  
  get_pref: function lo_get_pref( name, get_type_func, default_val ) {
    var pref_name = LOOKOUT_PREF_PREFIX + name;
    var pref_val;
    try {
      var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
      pref_val = prefs[get_type_func]( pref_name );
    } catch (ex) {
      this.log_msg( "LO: warning: could not retrieve setting '" + pref_name + "': " + ex, 5 );
    }
    if( pref_val === void(0) )
      pref_val = default_val;
    
    return pref_val;
  },
  get_bool_pref: function lo_get_bool_pref( name, default_val ) {
    return this.get_pref( name, "getBoolPref", default_val );
  },
  get_string_pref: function lo_get_string_pref( name, default_val ) {
    return this.get_pref( name, "getCharPref", default_val );
  },
  get_int_pref: function lo_get_int_pref( name, default_val ) {
    return this.get_pref( name, "getIntPref", default_val );
  },
  
  basename: function lo_basename( path ) {
    var file = Components.classes["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile);
    
    try {
      file.initWithPath( path );
      return( file.leafName );
    } catch (e) {
      return( null );
    }
  },
  
  // Since we're automatically downloading, we don't get the file picker's
  // logic to check for existing files, so we need to do that here.
  //
  // Note - this code is identical to that in contentAreaUtils.js.
  // If you are updating this code, update that code too! We can't share code
  // here since this is called in a js component.
  find_unique_filename: function lo_find_unique_filename( aLocalFile ) {
    var uniqifier_re = /(-\d+)?(\.[^.]+)?$/;
    var parts = uniqifier_re.exec( aLocalFile.leafName );
    var prefix = "";
    var uniqifier = 0;
    var postfix = "";
    
    if( parts && parts.index >= 0 ) {
      this.log_msg( aLocalFile.path + " -> " + parts.toSource(), 7 );
      prefix = aLocalFile.leafName.slice( 0, parts.index - 1 );
      if( parts[1] != undefined )
	uniqifier = parseInt( parts[1].substr( 1 ) ); // chop '-'
      if( parts[2] != undefined )
	postfix = parts[2];
    } else {
      prefix = aLocalFile.leafName;
    }
    
    while( aLocalFile.exists() ) {
      uniqifier++;
      aLocalFile.leafName = prefix + "-" + uniqifier + postfix;
    }
    return( aLocalFile );
  },
  
  make_temp_file: function lo_make_temp_file( filename ) {
    var file_locator = Components.classes["@mozilla.org/file/directory_service;1"].getService(Components.interfaces.nsIProperties);
    var temp_dir = file_locator.get( "TmpD", Components.interfaces.nsIFile );
    
    var local_target = temp_dir.clone();
    local_target.append( filename );
    
    return( this.find_unique_filename( local_target ) );
  },
  
  cal_trans_mgr: null,
  
  get_cal_trans_mgr: function lo_get_cal_trans_mgr() {
    if( !this.cal_trans_mgr ) {
      try {
	this.cal_trans_mgr = Components.classes["@mozilla.org/calendar/transactionmanager;1"].getService(Components.interfaces.calITransactionManager);
      } catch (ex) {
	this.cal_trans_mgr = Components.classes["@mozilla.org/transactionmanager;1"].createInstance(Components.interfaces.nsITransactionManager);
      }
    }
    return( this.cal_trans_mgr );
  },
  
  cal_update_undo_redo_menu: function lo_cal_update_undo_redo_menu() {
    var trans_mgr = this.get_cal_trans_mgr();
    if( !trans_mgr )
      return;
    
    if( trans_mgr.numberOfUndoItems )
      document.getElementById('undo_command').removeAttribute( 'disabled' );
    else
      document.getElementById('undo_command').setAttribute( 'disabled', true );
    
    if( trans_mgr.numberOfRedoItems )
      document.getElementById('redo_command').removeAttribute( 'disabled' );
    else
      document.getElementById('redo_command').setAttribute( 'disabled', true );
  },
  
  cal_add_items: function lo_cal_add_items( destCal, aItems, aFilePath ) {
    var trans_mgr = this.get_cal_trans_mgr();
    if( !trans_mgr )
      return;
    
    // Set batch for the undo/redo transaction manager
    trans_mgr.beginBatch();
    
    // And set batch mode on the calendar, to tell the views to not
    // redraw until all items are imported
    destCal.startBatch();
    
    // This listener is needed to find out when the last addItem really
    // finished. Using a counter to find the last item (which might not
    // be the last item added)
    var count = 0;
    var failedCount = 0;
    var duplicateCount = 0;
    // Used to store the last error. Only the last error, because we don't
    // wan't to bomb the user with thousands of error messages in case
    // something went really wrong.
    // (example of something very wrong: importing the same file twice.
    //  quite easy to trigger, so we really should do this)
    var lastError;
    var listener = {
      onOperationComplete: function (aCalendar, aStatus, aOperationType, aId, aDetail) {
	count++;
	if (!Components.isSuccessCode(aStatus)) {
	  if (aStatus == Components.interfaces.calIErrors.DUPLICATE_ID) {
	    duplicateCount++;
	  } else {
	    failedCount++;
	    lastError = aStatus;
	  }
	}
	// See if it is time to end the calendar's batch.
	if (count == aItems.length) {
	  destCal.endBatch();
	  var sbs = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService);
	  var cal_strbundle = sbs.createBundle("chrome://calendar/locale/calendar.properties");
	  if (!failedCount && duplicateCount ) {
	    this.log_msg( "LookOut: " + cal_strbundle.GetStringFromName( "duplicateError" ) + " " +
			duplicateCount + " " + aFilePath, 3 );
	  } else if (failedCount) {
	    this.log_msg( "LookOut: " + cal_strbundle.GetStringFromName( "importItemsFailed" ) + " " +
			failedCount + " " + lastError.toString(), 3 );
	  }
	}
      }
    };
    
    for( var i = 0; i < aItems.length; i++ ) {
      // XXX prompt when finding a duplicate.
      try {
	destCal.addItem( aItems[i], listener );
      } catch (ex) {
	failedCount++;
	lastError = ex;
	// Call the listener's operationComplete, to increase the
	// counter and not miss failed items. Otherwise, endBatch might
	// never be called.
	listener.onOperationComplete( null, null, null, null, null );
	Components.utils.reportError( "Import error: " + ex );
      }
    }
    
    // End transmgr batch
    trans_mgr.endBatch();
    this.cal_update_undo_redo_menu();
  }
}


const LOOKOUT_ACTION_SCAN = 0;
const LOOKOUT_ACTION_OPEN = 1;
const LOOKOUT_ACTION_SAVE = 2;

function LookoutStreamListener() {
}
LookoutStreamListener.prototype = {
  attachment: null,
  mAttUrl: null,
  mMsgUri: null,
  mStream: null,
  mPackage: null,
  mPartId: 1,
  mMsgHdr: null,
  action_type: LOOKOUT_ACTION_SCAN,
  req_part_id: 0,
  
  stream_started: false,
  cur_outstrm_listener: null,
  cur_outstrm: null,
  cur_content_type: null,
  cur_length: 0,
  cur_date: null,
  cur_url: "",

  QueryInterface: function ( iid )  {
    if( iid.equals( Components.interfaces.nsIStreamListener ) ||
	iid.equals( Components.interfaces.nsISupports ) )
      return this;

    throw Components.results.NS_NOINTERFACE;
    return( 0 );
  },

  onStartRequest: function ( aRequest, aContext ) {
    this.mStream = Components.classes['@mozilla.org/binaryinputstream;1'].createInstance(Components.interfaces.nsIBinaryInputStream);
  },
  
  onStopRequest: function ( aRequest, aContext, aStatusCode ) {
    var channel = aRequest.QueryInterface(Components.interfaces.nsIChannel);
    var fsm;
    
    try {
      fsm = GetDBView().URIForFirstSelectedMessage;
    } catch(ex) {
      fsm = this.mMsgUri; // continue in single message view
    }

    if( !(this.mMsgUri == fsm && this.mStream) ) {
      lookout.log_msg( "LookOut: strange things a foot", 5 );
      aRequest.cancel( Components.results.NS_BINDING_ABORTED );
      return;
    }

    this.mPartId++;
    this.mStream = null;
    this.stream_started = false;
    this.mPackage = null;
  },

  onDataAvailable: function ( aRequest, aContext, aInputStream, aOffset, aCount ) {
    var fsm;
    
    try {
      fsm = GetDBView().URIForFirstSelectedMessage;
    } catch(ex) {
      fsm = this.mMsgUri; // continue in single message view
    }

    if( this.mMsgUri != fsm ) {
      lookout.log_msg( "LookOut: data available wrong", 5 );
      aRequest.cancel( Components.results.NS_BINDING_ABORTED );
      return;
    }
    if( !this.stream_started ) {
      this.mStream.setInputStream( aInputStream );
      this.stream_started = true;
    }

    this.mPackage = tnef_pack_parse_stream( this.mStream, this.mMsgHdr, this, this.mPackage );
  },

  onTnefStart: function ( filename, content_type, length, date ) {
    var mimeurl = this.mAttUrl + "." + this.mPartId;
    var basename = lookout.basename( filename );
    
    if( basename )
      filename = basename;
    
    if( !content_type )
      content_type = "application/binary";
    
    
    if( this.action_type == LOOKOUT_ACTION_SCAN ) {
      lookout.log_msg( "adding attachment: " + mimeurl, 7 );
      lookout_lib.add_sub_attachment_to_list( this.attachment, content_type, filename,
                                              this.mPartId, mimeurl, this.mMsgUri, length );
    } else {
      lookout.log_msg( "open or save: " + this.mAttUrl + "." + this.mPartId, 7 );
      if( !this.req_part_id || this.mPartId == this.req_part_id ) {
	// ensure these are null for the following case evaluation
	this.cur_outstrm = null;
	this.cur_outstrm_listener = null;
	// fill in all known info
        this.cur_filename = filename;
        this.cur_content_type = content_type;
        this.cur_length = length;
        this.cur_date = date;
        this.cur_url = mimeurl;
	
	if( lookout.get_bool_pref( "direct_to_calendar" ) &&
	    content_type == "text/calendar" ) {
	  try {
	    this.cur_outstrm_listener = Components.classes["@mozilla.org/calendar/import;1?type=ics"]
	                                  .getService(Components.interfaces.calIImporter);
	  } catch (ex) { }
	  if( this.cur_outstrm_listener ) {
	    // we are using the default interface of Output Stream to be consistent
	    this.cur_outstrm = Components.classes["@mozilla.org/storagestream;1"].createInstance(Components.interfaces.nsIOutputStream);
	    this.cur_outstrm.QueryInterface(Components.interfaces.nsIStorageStream).init( 4096, 0xFFFFFFFF, null );
	  }
	}
	
	if( !this.cur_outstrm ) {
	  var outfile = lookout.make_temp_file( filename );
	  var ios = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
	  this.cur_url = ios.newFileURI( outfile );
	  
	  this.cur_outstrm = Components.classes["@mozilla.org/network/file-output-stream;1"]
                               .createInstance(Components.interfaces.nsIFileOutputStream);
	  this.cur_outstrm.init( outfile, 0x02 | 0x08, 0666, 0 );
	}
      }
    }
    lookout.log_msg( "LookOut: onTnefStart\nParent: " + this.attachment +
		"\nmMsgUri: "+this.mMsgUri +
		"\nrequested Part_ID: " + this.req_part_id +
		"\nPart_ID: " + this.mPartId +
		"\nDisplayname: " + filename.split("\0")[0] +
		"\nContent-Type: " + content_type.split("\0")[0] +
		"\nLength: " + length +
		"\nURL: " + (this.cur_url ? this.cur_url.spec : "") +
		"\nmimeurl: " + (mimeurl ? mimeurl : ""), 7 );
  },

  onTnefEnd: function ( ) {
    lookout.log_msg( "LookOut: onTnefEnd", 8 );
    if( this.cur_outstrm )
      this.cur_outstrm.close();
    
    if( !this.req_part_id || this.mPartId == this.req_part_id ) {
      switch( this.action_type ) {
      case LOOKOUT_ACTION_SAVE:
	lookout.log_msg( "Saving attachment '" + this.cur_url.spec + "'", 7 );
	messenger.saveAttachment( this.cur_content_type, this.cur_url.spec, this.cur_filename, this.mMsgUri, true );
	break;
      case LOOKOUT_ACTION_OPEN:
	lookout.log_msg( "Opening attachment '"+ this.cur_url.spec+"'", 7 );
	if( lookout.get_bool_pref( "direct_to_calendar" ) &&
	    this.cur_content_type == "text/calendar" && this.cur_outstrm_listener ) {
	  var cal_items = new Array();
	  
	  try {
	    var instrm = this.cur_outstrm.QueryInterface(Components.interfaces.nsIStorageStream).newInputStream( 0 );
	    cal_items = this.cur_outstrm_listener.importFromStream( instrm, { } );
	    instrm.close();
	  } catch (ex) {
	    lookout.log_msg( "LookOut: error opening calendar stream: " + ex, 3 );
	  }
	  var count_o = new Object();
	  var cal_mgr = Components.classes["@mozilla.org/calendar/manager;1"].getService(Components.interfaces.calICalendarManager);
	  var calendars = cal_mgr.getCalendars( count_o );
	  
	  if (count_o.value == 1) {
            // There's only one calendar, so it's silly to ask what calendar
            // the user wants to import into.
	    lookout.cal_add_items( calendars[0], cal_items, this.cur_filename );
	  } else {
	    var sbs = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService);
	    var cal_strbundle = sbs.createBundle("chrome://calendar/locale/calendar.properties");
	    
	    // Ask what calendar to import into
	    var args = new Object();
	    args.onOk = function putItems(aCal) { lookout.cal_add_items( aCal, cal_items, this.cur_filename ); };
	    args.promptText = cal_strbundle.GetStringFromName( "importPrompt" );
	    openDialog( "chrome://calendar/content/chooseCalendarDialog.xul",
			"_blank", "chrome,titlebar,modal,resizable", args );
	  }
	} else {
	  messenger.openAttachment( this.cur_content_type, this.cur_url.spec, this.cur_filename, this.mMsgUri, true );
	}
	break;
      }
    }
    
    // redraw attachment pane one last time to get correct size
    lookout_lib.redraw_attachment_view( this.cur_url );
    
    this.cur_outstrm_listener = null;
    this.cur_outstrm = null;
    this.cur_content_type = null;
    this.cur_length = 0;
    this.cur_date = null;
    this.cur_url = null;
    this.mPartId++;
  },

  onTnefData: function ( position, data ) {
    lookout.log_msg( "LookOut: onTnefData position " + position + "  data.len " + data.length + "  outstrm " + this.cur_outstrm, 7 );
    if( this.cur_outstrm ) {
      if( data ) {
        lookout.log_msg( "LookOut: writing " + data.length + "bytes to file", 7 );
        this.cur_outstrm.write( data, data.length );
      }
    }
  }
}  


/*
var DecapsulateMsgHeaderSink = {
  dummyMsgHeader: "",
  properties,
  securityInfo,

  void handlePart( int index , char* contentType , char* url , PRUnichar* displayName , char* uri , PRBool notDownloaded , nsIUTF8StringEnumerator headerNames , nsIUTF8StringEnumerator headerValues , PRBool dontCollectAddress );
  void onEndAllParts ( )
  void onEndEncapDownload ( nsIMsgMailNewsUrl url )
  void onEndEncapHeaders ( nsIMsgMailNewsUrl url )
  void onEncapHasRemoteContent ( nsIMsgDBHdr msgHdr )
}
*/

var lookout_lib = {
  orig_openAttachment: null,
  orig_saveAttachment: null,
  orig_onEndAllAttachments: null,
  orig_processHeaders: null,
  orig_cloneAttachment: null,
  init_wait: 0,

  onload: function() {
    // FIXME - Register onEndAllAttachments listener with messageHeaderSink
    // For now monkey patch messageHeaderSink.onEndAllAttachments and messageHeaderSink.processHeaders
    // (see mail/base/content/msgHdrOverlay.js).
    
    // Make sure other global init has finished e.g. messageHeaderSink
    // has been defined
    if( typeof messageHeaderSink != 'undefined' && messageHeaderSink ) {
      lookout_lib.orig_onEndAllAttachments = messageHeaderSink.onEndAllAttachments;
      messageHeaderSink.onEndAllAttachments = lookout_lib.on_end_all_attachments;
    } else {
      if ( lookout_lib.init_wait < LOOKOUT_WAIT_MAX ) {
	lookout_lib.init_wait++;
	lookout.log_msg( "LookOut: waiting for global init ("  + lookout_lib.init_wait + ")");
	setTimeout( lookout_lib.onload, LOOKOUT_WAIT_TIME );
	return;
	
      } else {
	lookout.log_msg( "LookOut: Warning initialisation incomplete", 2 );
      }
    }
    lookout.log_msg( "LookOut: Waited " + lookout_lib.init_wait + " times for global init" );
    lookout_lib.init_wait = 0;
    
    var listener = {};
    listener.onStartHeaders = lookout_lib.on_start_headers;
    listener.onEndHeaders = lookout_lib.on_end_headers;
    gMessageListeners.push( listener );
    
    // FIXME - fix mozilla so there is a cleaner way here
    // monkey patch the openAttachment and saveAttachment functions
    if( typeof openAttachment != 'undefined' && openAttachment ) {
      lookout_lib.orig_openAttachment = openAttachment;
      openAttachment = lookout_lib.open_attachment;
    }
    if( typeof saveAttachment != 'undefined' && saveAttachment ) {
      lookout_lib.orig_saveAttachment = saveAttachment;
      saveAttachment = lookout_lib.save_attachment;
    }
    if( typeof cloneAttachment != 'undefined' && cloneAttachment ) {
      lookout_lib.orig_cloneAttachment = cloneAttachment;
      cloneAttachment = lookout_lib.clone_attachment;
    }
  },

  msg_hdr_for_current_msg: function( msg_uri ) {
    var mms = messenger.messageServiceFromURI( msg_uri )
               .QueryInterface( Components.interfaces.nsIMsgMessageService );
    var hdr = null;
    
    if( mms ) {
      try {
	hdr = mms.messageURIToMsgHdr( msg_uri );
      } catch( ex ) { }
      if( !hdr ) {
	try {
	  var url_o = new Object(); // return container object
	  mms.GetUrlForUri( msg_uri, url_o, msgWindow );
	  var url = url_o.value.QueryInterface( Components.interfaces.nsIMsgMessageUrl );
	  hdr = url.messageHeader;
	} catch( ex ) { }
      }
    }
    if( !hdr && gDBView.msgFolder ) {
      try {
	hdr = gDBView.msgFolder.GetMessageHeader( gDBView.getKeyAt( gDBView.currentlyDisplayedMessage ) );
      } catch( ex ) { }
    }
    if( !hdr && messageHeaderSink )
      hdr = messageHeaderSink.dummyMsgHeader;
    
    return hdr;
  },

  scan_for_tnef: function ( ) {
    var messenger2 = Components.classes["@mozilla.org/messenger;1"]
                    .getService(Components.interfaces.nsIMessenger);
    
    // for each attachment of the current message
    for( index in currentAttachments ) {
      var attachment = currentAttachments[index];
      lookout.log_msg( attachment.toSource(), 8 );
      // we only decode tnef files
      if( (/^application\/ms-tnef/i).test( attachment.contentType ) ) {
        lookout.log_msg( "LookOut: found tnef", 7 );
	
	// open the attachment and look inside
	var stream_listener = new LookoutStreamListener();
	stream_listener.attachment = attachment;
	stream_listener.mAttUrl = attachment.url;
	if( attachment.uri )
	  stream_listener.mMsgUri = attachment.uri;
	else
	  stream_listener.mMsgUri = attachment.messageUri;
	stream_listener.mMsgHdr = lookout_lib.msg_hdr_for_current_msg( stream_listener.mMsgUri );
	if( ! stream_listener.mMsgHdr )
	  lookout.log_msg( "LookOut: no message header for this service", 5 );
	stream_listener.action_type = LOOKOUT_ACTION_SCAN;
	
	var mms = messenger2.messageServiceFromURI( stream_listener.mMsgUri )
                   .QueryInterface( Components.interfaces.nsIMsgMessageService );
	var attname = attachment.name ? attachment.name : attachment.displayName;
	mms.openAttachment( attachment.contentType, attname,
			    attachment.url, stream_listener.mMsgUri, stream_listener, 
			    null, null );
      }
    }
  },

  add_sub_attachment_to_list: function ( parent, content_type, display_name, part_id, atturl, msguri, length ) {
    var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
    
    /*
    var attachmentList = document.getElementById( 'attachmentList' );
    var i = 0;
    
    for( i = 0; i < attachmentList.childNodes.length &&
	        attachmentList.childNodes[i].attachment.url != attUrl; i++ );

    // if we found our list item then we are done
    if( i >= attachmentList.childNodes.length )
      return;
    */
    lookout.log_msg( " content_type:"+content_type +", atturl:"+ atturl +",  display_name:"+ display_name +", msguri:"+ msguri, 8 );
    var attachment = null;
    if( typeof AttachmentInfo != 'undefined' )
      var attachment = new AttachmentInfo( content_type, atturl, display_name, msguri, true, length )
    else
      var attachment = new createNewAttachmentInfo( content_type, atturl, display_name, msguri, true )
    if( attachment.open ) {
      attachment.lo_orig_open = attachment.open;
      attachment.open = function () {
        lookout_lib.open_attachment( this );
      };
    }
    if( attachment.save ) {
      attachment.lo_orig_save = attachment.save;
      attachment.save = function () {
        lookout_lib.save_attachment( this );
      };
    }
    attachment.parent = parent;
    attachment.part_id = part_id;
    currentAttachments.push( attachment );
    lookout.log_msg( attachment.toSource(), 8 );
    lookout_lib.redraw_attachment_view( atturl );
  },

  // we need to explicitly call display functions because we process tnef
  // attachment asynchronously and TB attachment processing has already finished
  // e.g. messageHeaderSink.OnEndAllAttachments
  // (see mail/base/content/msgHdrViewOverlay.js)
  redraw_attachment_view: function ( atturl ) {
    lookout.log_msg( "Lookout: redraw_attachment_view()", 8 );
    ClearAttachmentList();
    gBuildAttachmentsForCurrentMsg = false;
    // TODO - make sure attachment popup menu is not broken
    gBuildAttachmentPopupForCurrentMsg = true;
    displayAttachmentsForExpandedView();
    
    // try to call "Attachment Sizes", extension {90ceaf60-169c-40fb-b224-7204488f061d}
    if( typeof ABglobals != 'undefined' ) {
      try {
	ABglobals.setAttSizeTextFor( atturl, length, false );
      } catch(ex) {}
    }
  },

  open_attachment: function ( attachment ) {
    lookout.log_msg( attachment.toSource(), 8 );

    if( !attachment.parent ||
	!(/^application\/ms-tnef/i).test( attachment.parent.contentType ) ) {
      if( attachment.lo_orig_open )
	attachment.lo_orig_open();
      else if( lookout_lib.orig_openAttachment )
        lookout_lib.orig_openAttachment( attachment );
      return;
    }

    var messenger2 = Components.classes["@mozilla.org/messenger;1"]
                    .getService(Components.interfaces.nsIMessenger);
    var stream_listener = new LookoutStreamListener();
    stream_listener.req_part_id = attachment.part_id;
    stream_listener.mAttUrl = attachment.parent.url;
    if( attachment.uri )
      stream_listener.mMsgUri = attachment.uri;
    else
      stream_listener.mMsgUri = attachment.messageUri;
    stream_listener.mMsgHdr = lookout_lib.msg_hdr_for_current_msg( stream_listener.mMsgUri );
    stream_listener.action_type = LOOKOUT_ACTION_OPEN;
    
    var attname = attachment.name ? attachment.name : attachment.displayName;

    lookout.log_msg( "open_attachment\nParent: "+(attachment.parent == null ? "-" : attachment.parent.url)
              +"\nContent-Type: "+attachment.contentType.split("\0")[0]
              +"\nDisplayname: "+attname.split("\0")[0]
              +"\nPart_ID: "+attachment.part_id
              +"\nisExternal: "+attachment.isExternalAttachment
              +"\nURL: "+attachment.url
              +"\nmMsgUri: "+stream_listener.mMsgUri, 7 );
    var mms = messenger2.messageServiceFromURI( stream_listener.mMsgUri )
              .QueryInterface( Components.interfaces.nsIMsgMessageService );
    
    attname = attachment.parent.name ? attachment.parent.name : attachment.parent.displayName;
    mms.openAttachment( attachment.parent.contentType, attname,
			attachment.parent.url, stream_listener.mMsgUri, stream_listener, 
			null, null );
  },

  save_attachment: function ( attachment ) {
    if( !attachment.parent ||
	!(/^application\/ms-tnef/i).test( attachment.parent.contentType ) ) {
      if( attachment.lo_orig_save )
	attachment.lo_orig_save();
      else if( lookout_lib.orig_saveAttachment )
        lookout_lib.orig_saveAttachment( attachment );
      return;
    }
    
    var messenger2 = Components.classes["@mozilla.org/messenger;1"]
                    .getService(Components.interfaces.nsIMessenger);
    var stream_listener = new LookoutStreamListener(); 
    stream_listener.req_part_id = attachment.part_id;
    stream_listener.mAttUrl = attachment.parent.url;
    if( attachment.uri )
      stream_listener.mMsgUri = attachment.uri;
    else
      stream_listener.mMsgUri = attachment.messageUri;
    stream_listener.mMsgHdr = lookout_lib.msg_hdr_for_current_msg( stream_listener.mMsgUri );
    stream_listener.action_type = LOOKOUT_ACTION_SAVE;
    
    var attname = attachment.name ? attachment.name : attachment.displayName;

    lookout.log_msg( "save_attachment\nParent: "+(attachment.parent == null ? "-" : attachment.parent.url)
              +"\nContent-Type: "+attachment.contentType.split("\0")[0]
              +"\nDisplayname: "+attname.split("\0")[0]
              +"\nPart_ID: "+attachment.part_id
              +"\nisExternal: "+attachment.isExternalAttachment
              +"\nURL: "+attachment.url
              +"\nmMsgUri: "+stream_listener.mMsgUri, 7 );
    var mms = messenger2.messageServiceFromURI( stream_listener.mMsgUri )
              .QueryInterface( Components.interfaces.nsIMsgMessageService );
    attname = attachment.parent.name ? attachment.parent.name : attachment.parent.displayName;
    mms.openAttachment( attachment.parent.contentType, attname,
			attachment.parent.url, stream_listener.mMsgUri, stream_listener, 
			null, null );
  },

  clone_attachment: function( attachment ) {
    if( !attachment.parent ||
	!(/^application\/ms-tnef/i).test( attachment.parent.contentType ) ) {
      return lookout_lib.orig_cloneAttachment( attachment );
    }
    
    //TODO original code didn't clone. is it necessary?
    var obj = lookout_lib.orig_cloneAttachment( attachment );
    obj.parent = attachment.parent;
    obj.part_id = attachment.part_id;
    return obj;
  },

  on_end_all_attachments: function () {
    //attachment parsing has finished
    lookout_lib.scan_for_tnef();
    //call hijacked onEndAllAttachments
    lookout_lib.orig_onEndAllAttachments();
  },

  on_start_headers: function () {
  },

  on_end_headers: function () {
    // there is a race condition between the onEndHeaders listener function
    // being called and the completion of attachment parsing. Wait for call
    // to onEndAllAttachments()
    
    // defer the call so it is called after all the header work is done
    //   (should have nothing to do with amount of delay)
    //setTimeout( lookout_lib.scan_for_tnef, 100 );
  }
}
window.addEventListener( 'load', lookout_lib.onload, false );

