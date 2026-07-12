"""
Token authentication endpoints for the React SPA.

The SPA logs in once via ``POST /api/auth/login/`` and stores the returned token,
then sends ``Authorization: Token <key>`` on every subsequent request. Token auth
is a single indexed lookup with no password hashing, so it avoids the ~300ms
per-request PBKDF2 cost that HTTP Basic auth incurs.

Contract:
    POST /api/auth/login/   {"username","password"}
        200 {"token": "<key>", "user": {"username": "...", "email": "..."}}
        400 {"detail": "..."}                       (bad / missing credentials)
    POST /api/auth/logout/  (auth required) -> 204   (deletes the caller's token)
    GET  /api/auth/me/      (auth required) -> 200 {"username","email"}
"""
from rest_framework import status
from rest_framework.authentication import (
    BasicAuthentication,
    SessionAuthentication,
    TokenAuthentication,
)
from rest_framework.authtoken.models import Token
from rest_framework.authtoken.serializers import AuthTokenSerializer
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView


def _user_payload(user):
    return {"username": user.get_username(), "email": user.email or ""}


class LoginView(APIView):
    """Exchange username/password for an auth token."""

    authentication_classes = []  # login must not require an existing credential
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = AuthTokenSerializer(
            data=request.data, context={"request": request}
        )
        if not serializer.is_valid():
            # Collapse DRF's field/non-field errors into a single detail string so
            # the SPA gets a predictable {"detail": "..."} shape on 400.
            detail = "Unable to log in with the provided credentials."
            non_field = serializer.errors.get("non_field_errors")
            if non_field:
                detail = str(non_field[0])
            return Response(
                {"detail": detail}, status=status.HTTP_400_BAD_REQUEST
            )
        user = serializer.validated_data["user"]
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key, "user": _user_payload(user)})


class LogoutView(APIView):
    """Delete the caller's token, invalidating it everywhere."""

    # Token first so a token-bearing client can log itself out.
    authentication_classes = [
        TokenAuthentication,
        SessionAuthentication,
        BasicAuthentication,
    ]
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    """Cheap identity check the SPA calls after loading a stored token."""

    authentication_classes = [
        TokenAuthentication,
        SessionAuthentication,
        BasicAuthentication,
    ]
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(_user_payload(request.user))
