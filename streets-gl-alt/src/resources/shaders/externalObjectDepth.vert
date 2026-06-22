#include <versionPrecision>

in vec3 position;

uniform MainBlock {
	mat4 projectionMatrix;
	mat4 modelViewMatrix;
};

void main() {
	// Non-instanced depth transform for external objects (shadow mapping).
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
