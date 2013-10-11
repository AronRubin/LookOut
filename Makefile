##### Makefile for generating the add-on as a XPI archive
#
# v1  2011-10-20  MKA
# v2  2011-10-25  MKA  Added checks

DEBUG_STR = ">>> Did you reset the debug level in chrome/content/tnef.js?"
MANIF_STR = ">>> Did you change back the jar directive in chrome.manifest?"

ZIP_CMD = zip -r   # archive recursively (the defaults directory)
                   # -f could be used to update only if the xpi archive exists permanently 
XPI_FILE = lookout.xpi
CHRO_DIR = chrome
DEFA_DIR = defaults
MAN_FILE = chrome.manifest
INS_FILE = install.rdf
JAR_FILE = $(CHRO_DIR)/lookout.jar

all: check jar xpi

check:                                       # Make checks first
	echo $(DEBUG_STR) && read ANSWER
	echo $(MANIF_STR) && read ANSWER

jar:                                         # Generating the JAR archive
	cd $(CHRO_DIR) && make jar

xpi: $(JAR_FILE) $(MAN_FILE) $(INS_FILE)     # Generating the XPI archive
	$(ZIP_CMD) $(XPI_FILE) $(JAR_FILE) $(DEFA_DIR)/* $(MAN_FILE) $(INS_FILE)

clean:
	rm -f $(XPI_FILE) $(JAR_FILE)

