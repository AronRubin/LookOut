# all:lookout.jar
# 
# lookout.jar: content/*.js content/*.xul locale/en-US/*.dtd locale/en-US/*.properties skin/*.css
# 	zip -f $@ $^

##### Makefile for generating the JAR archive
#
# v1  2011-10-20 MKA

JAR_CMD = jar cvfM
JAR_BASE = .
JAR_FILE = lookout.jar
CONT_DIR = content
LOCA_DIR = locale
SKIN_DIR = skin
JS_FILES := $(wildcard $(JAR_BASE)/$(CONT_DIR)/*.js)
XUL_FILES := $(wildcard $(JAR_BASE)/$(CONT_DIR)/*.xul)
LOC_FILES := $(wildcard $(JAR_BASE)/$(LOCA_DIR)/*)
CSS_FILES := $(wildcard $(JAR_BASE)/$(SKIN_DIR)/*.css)
ICO_FILES := $(wildcard $(JAR_BASE)/$(SKIN_DIR)/LOicon*.png)

all: jar

# Generating the JAR archive
jar: $(JS_FILES) $(XUL_FILES) $(LOC_FILES) $(CSS_FILES) $(ICO_FILES)
	$(JAR_CMD) $(JAR_FILE) $(JS_FILES) $(XUL_FILES) $(LOC_FILES) $(CSS_FILES) $(ICO_FILES)


