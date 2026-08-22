package v1

import (
	"errors"
	"strings"
	"testing"

	"connectrpc.com/connect"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestConvertGRPCError(t *testing.T) {
	tests := []struct {
		name         string
		input        error
		wantNil      bool
		wantCode     connect.Code
		wantContains string
	}{
		{
			name:    "nil error",
			input:   nil,
			wantNil: true,
		},
		{
			name:         "grpc status error keeps code and plain message",
			input:        status.Errorf(codes.InvalidArgument, "unmatched username and password"),
			wantCode:     connect.CodeInvalidArgument,
			wantContains: "unmatched username and password",
		},
		{
			name:         "unauthenticated status error",
			input:        status.Errorf(codes.Unauthenticated, "authentication required"),
			wantCode:     connect.CodeUnauthenticated,
			wantContains: "authentication required",
		},
		{
			name:         "non-status error maps to internal",
			input:        errors.New("boom"),
			wantCode:     connect.CodeInternal,
			wantContains: "boom",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := convertGRPCError(test.input)
			if test.wantNil {
				if err != nil {
					t.Fatalf("expected nil error, got %v", err)
				}
				return
			}

			var connectErr *connect.Error
			if !errors.As(err, &connectErr) {
				t.Fatalf("expected *connect.Error, got %T: %v", err, err)
			}
			if connectErr.Code() != test.wantCode {
				t.Fatalf("unexpected code: got %v, want %v", connectErr.Code(), test.wantCode)
			}
			if !strings.Contains(connectErr.Message(), test.wantContains) {
				t.Fatalf("unexpected message %q, want it to contain %q", connectErr.Message(), test.wantContains)
			}
		})
	}
}

// TestConvertGRPCErrorStripsRPCPrefix ensures the client-visible message no longer
// carries the "rpc error: code = ... desc = ..." wrapper produced by status.Error.
func TestConvertGRPCErrorStripsRPCPrefix(t *testing.T) {
	err := convertGRPCError(status.Errorf(codes.InvalidArgument, "unmatched username and password"))

	var connectErr *connect.Error
	if !errors.As(err, &connectErr) {
		t.Fatalf("expected *connect.Error, got %T: %v", err, err)
	}
	msg := connectErr.Message()
	if msg != "unmatched username and password" {
		t.Fatalf("message should be plain status text without rpc prefix, got %q", msg)
	}
}
