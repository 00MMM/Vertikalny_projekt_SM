#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#define fotoRezistorPin 6
#define termoRezistorPin 4

// --- Configuration ---
const char* ssid = "E5576_E584";
const char* password = "qH3bRanMTdb";

// Use your computer's IP address (e.g., 192.168.1.15) 
// DO NOT use 127.0.0.1 (that only works inside the computer itself)
const char* mqtt_server = "192.168.8.60";
const int mqtt_port = 1883;
const char* mqtt_user = "esp32_sensor";
const char* mqtt_pass = "f09f0de9ece9733bf86ca0650a9ac2c130d3d324429e6e78f531a5fed2edb14f";
const char* mqtt_topic = "devices/esp32_sensor/measurements";

WiFiClient espClient;
PubSubClient client(espClient);

int lightValue = 0;
float tempCValue = 0;
long lastmes = 0; 

void setup() {
  Serial.begin(115200);
  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
}

void setup_wifi() {
  delay(10);
  Serial.print("Connecting to WiFi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected");
  Serial.print("ESP IP: ");
  Serial.println(WiFi.localIP());
  Serial.print("Gateway: ");
  Serial.println(WiFi.gatewayIP());
  Serial.print("Subnet: ");
  Serial.println(WiFi.subnetMask());
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Testing TCP ");
    Serial.print(mqtt_server);
    Serial.print(":");
    Serial.print(mqtt_port);
    Serial.print("...");
    WiFiClient testClient;
    if (testClient.connect(mqtt_server, mqtt_port)) {
      Serial.println("open");
      testClient.stop();
    } else {
      Serial.println("closed");
    }

    Serial.print("Attempting MQTT connection...");
    // Attempt to connect with Username and Password
    if (client.connect("ESP32Client", mqtt_user, mqtt_pass)) {
      Serial.println("connected");
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

void loop() {
  lightValue = analogRead(fotoRezistorPin);
  int tempRawValue = analogRead(termoRezistorPin);
  float mVolts = tempRawValue * (3300.0 / 4095.0);
  tempCValue = (mVolts - 500.0) / 10.0;

  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  // Create JSON every 5 seconds
  static unsigned long lastMsg = 0;
  if (millis() - lastMsg > 5000) {
    lastMsg = millis();

    // 1. Create the JSON document
    StaticJsonDocument<200> doc;
    doc["device_id"] = "esp32_sensor";
    doc["status"] = "connected";
    doc["light"] = lightValue;
    doc["temp"] = tempCValue;

    // 2. Serialize JSON to a string
    char buffer[256];
    serializeJson(doc, buffer);

    // 3. Publish to Broker
    Serial.print("Publishing message: ");
    Serial.println(buffer);
    client.publish(mqtt_topic, buffer);
  }
}
