package dbosui

import (
	"sync"
	"time"
)

// StreamEventKind is the kind of realtime hint emitted by the server.
// Clients use it to decide which local caches to invalidate.
type StreamEventKind int

const (
	StreamEventUnspecified StreamEventKind = iota
	StreamEventWorkflowsChanged
	StreamEventNotificationAdded
	StreamEventWorkflowEventSet
)

// StreamEvent is one realtime hint. WorkflowID and Topic are populated when
// the kind makes them meaningful; otherwise they are empty.
type StreamEvent struct {
	Kind       StreamEventKind
	WorkflowID string
	Topic      string
	At         time.Time
}

// EventHub is a tiny fan-out pubsub. Publish is non-blocking: if a
// subscriber's buffer is full, the event is dropped for that subscriber
// rather than slowing everyone else down. Subscribers are responsible for
// draining quickly and unsubscribing on context cancel.
type EventHub struct {
	mu          sync.RWMutex
	subscribers map[chan StreamEvent]struct{}
}

// NewEventHub constructs an empty hub.
func NewEventHub() *EventHub {
	return &EventHub{subscribers: make(map[chan StreamEvent]struct{})}
}

// Subscribe registers a subscriber and returns its channel. Buffer is 16
// — enough to absorb small bursts; events past that are dropped for this
// subscriber.
func (h *EventHub) Subscribe() chan StreamEvent {
	ch := make(chan StreamEvent, 16)
	h.mu.Lock()
	h.subscribers[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

// Unsubscribe removes a subscriber and closes its channel. Idempotent.
func (h *EventHub) Unsubscribe(ch chan StreamEvent) {
	h.mu.Lock()
	if _, ok := h.subscribers[ch]; ok {
		delete(h.subscribers, ch)
		close(ch)
	}
	h.mu.Unlock()
}

// Publish fans out to all subscribers without blocking the caller.
func (h *EventHub) Publish(ev StreamEvent) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for ch := range h.subscribers {
		select {
		case ch <- ev:
		default:
			// Subscriber is slow — drop. The next periodic refresh will
			// reconcile any missed update.
		}
	}
}
