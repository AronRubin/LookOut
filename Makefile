##### Makefile for generating the add-on as a XPI archive
#
# v1  2011-10-20 MKA

ZIP_CMD = zip -r                   # archive recursively (the defaults directory)
                                   # -f could be used to update only if the xpi archive exists permanently 
XPI_FILE = lookout@aron.rubin.xpi
CHRO_DIR = chrome
DEFA_DIR = defaults
MAN_FILE = chrome.manifest
INS_FILE = install.rdf
JAR_FILE = $(CHRO_DIR)/lookout.jar

all: jar xpi

jar:                               # Generating the JAR archive
	cd $(CHRO_DIR) && make jar

xpi: $(JAR_FILE) $(MAN_FILE) $(INS_FILE)     # Generating the XPI archive
	$(ZIP_CMD) $(XPI_FILE) $(JAR_FILE) $(DEFA_DIR)/* $(MAN_FILE) $(INS_FILE)

clean:
	rm -f $(XPI_FILE) $(JAR_FILE)

