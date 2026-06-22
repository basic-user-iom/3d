#include <versionPrecision>

in vec3 position;
in vec3 normal;
in vec2 uv;

out vec4 vClipPos;
out vec4 vClipPosPrev;

out vec2 vUv;
out vec3 vNormal;
out vec3 vPosition;

uniform MainBlock {
	mat4 projectionMatrix;
	mat4 modelMatrix;
	mat4 viewMatrix;
	mat4 modelViewMatrixPrev;
};

void main() {
	vUv = uv;

	// External objects are NOT instanced: transform `position` directly by the
	// bound model/view/projection matrices. No per-instance attributes are used.
	vec3 modelNormal = normalize((modelMatrix * vec4(normal, 0)).xyz);
	vec3 modelViewNormal = normalize((viewMatrix * vec4(modelNormal, 0)).xyz);
	vNormal = modelViewNormal;

	vec4 cameraSpacePosition = viewMatrix * modelMatrix * vec4(position, 1);
	vec4 cameraSpacePositionPrev = modelViewMatrixPrev * vec4(position, 1);

	vPosition = vec3(cameraSpacePosition);

	vClipPos = projectionMatrix * cameraSpacePosition;
	vClipPosPrev = projectionMatrix * cameraSpacePositionPrev;

	gl_Position = vClipPos;
}
