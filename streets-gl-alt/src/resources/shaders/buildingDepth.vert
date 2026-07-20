#include <versionPrecision>

in vec3 position;
in uint display;

uniform PerMesh {
	mat4 modelViewMatrix;
};

uniform PerMaterial {
	mat4 projectionMatrix;
};

void main() {
	// Match extruded.vert: discarded buildings must not cast shadows.
	if (display > 0u) {
		gl_Position = vec4(2, 0, 0, 1);
		return;
	}

	vec3 transformedPosition = position;
	vec4 cameraSpacePosition = modelViewMatrix * vec4(transformedPosition, 1.0);

	gl_Position = projectionMatrix * cameraSpacePosition;
}
