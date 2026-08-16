package markdown

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestExtractAllWikiLinks(t *testing.T) {
	tests := []struct {
		name     string
		content  string
		withExt  bool
		expected []string
	}{
		{
			name:     "no wiki links",
			content:  "Just plain text",
			withExt:  true,
			expected: []string{},
		},
		{
			name:     "single wiki link",
			content:  "See [[Go 笔记]] for details",
			withExt:  true,
			expected: []string{"Go 笔记"},
		},
		{
			name:     "multiple wiki links",
			content:  "[[A]] and [[B]] and [[C]]",
			withExt:  true,
			expected: []string{"A", "B", "C"},
		},
		{
			name:     "duplicate wiki links deduplicated",
			content:  "[[work]] and [[Work]]",
			withExt:  true,
			expected: []string{"work", "Work"},
		},
		{
			name:     "title trimmed",
			content:  "[[  title  ]]",
			withExt:  true,
			expected: []string{"title"},
		},
		{
			name:     "empty title not recognized",
			content:  "[[]]",
			withExt:  true,
			expected: []string{},
		},
		{
			name:     "nested bracket not recognized",
			content:  "[[a[b]]",
			withExt:  true,
			expected: []string{},
		},
		{
			name:     "multiline not recognized",
			content:  "[[line1\nline2]]",
			withExt:  true,
			expected: []string{},
		},
		{
			name:     "single bracket not recognized",
			content:  "[title]",
			withExt:  true,
			expected: []string{},
		},
		{
			name:     "unclosed bracket not recognized",
			content:  "[[title",
			withExt:  true,
			expected: []string{},
		},
		{
			name:     "over 512 bytes not recognized",
			content:  "[[" + string(make([]byte, 513)) + "]]",
			withExt:  true,
			expected: []string{},
		},
		{
			name:     "exactly 512 bytes recognized",
			content:  "[[" + string(make([]byte, 512)) + "]]",
			withExt:  true,
			expected: []string{string(make([]byte, 512))},
		},
		{
			name:     "extension disabled collects nothing",
			content:  "See [[Go 笔记]] for details",
			withExt:  false,
			expected: []string{},
		},
		{
			name:     "wiki links and tags coexist",
			content:  "[[笔记]] with #tag",
			withExt:  true,
			expected: []string{"笔记"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var svc Service
			if tt.withExt {
				svc = NewService(WithWikiLinkExtension())
			} else {
				svc = NewService()
			}

			data, err := svc.ExtractAll([]byte(tt.content))
			require.NoError(t, err)
			assert.ElementsMatch(t, tt.expected, data.WikiLinks)
		})
	}
}

func TestExtractAllWikiLinksWithTagsAndMentions(t *testing.T) {
	svc := NewService(WithTagExtension(), WithMentionExtension(), WithWikiLinkExtension())

	data, err := svc.ExtractAll([]byte("Hello @Alice, read [[Go 笔记]] with #study"))
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"Go 笔记"}, data.WikiLinks)
	assert.ElementsMatch(t, []string{"alice"}, data.Mentions)
	assert.ElementsMatch(t, []string{"study"}, data.Tags)
}

func TestGenerateSnippetWikiLinks(t *testing.T) {
	svc := NewService(WithWikiLinkExtension())
	tests := []struct {
		name     string
		content  string
		expected string
	}{
		{
			name:     "wiki link preserved",
			content:  "See [[Go 笔记]] for details",
			expected: "See [[Go 笔记]] for details",
		},
		{
			name:     "wiki link with text",
			content:  "Check [[目标]] and move on",
			expected: "Check [[目标]] and move on",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			snippet, err := svc.GenerateSnippet([]byte(tt.content), 100)
			require.NoError(t, err)
			assert.Equal(t, tt.expected, snippet)
		})
	}
}

func TestRenderHTMLWikiLinks(t *testing.T) {
	svc := NewService(WithWikiLinkExtension())

	tests := []struct {
		name     string
		content  string
		expected string
	}{
		{
			name:     "wiki link preserved as literal text",
			content:  "See [[Go 笔记]] for details",
			expected: "<p>See [[Go 笔记]] for details</p>\n",
		},
		{
			name:     "wiki link with surrounding markdown",
			content:  "Check [[目标]] and **bold**",
			expected: "<p>Check [[目标]] and <strong>bold</strong></p>\n",
		},
		{
			name:     "plain text without wiki link",
			content:  "Hello #tag and @alice",
			expected: "<p>Hello #tag and @alice</p>\n",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			html, err := svc.RenderHTML([]byte(tt.content))
			require.NoError(t, err)
			assert.Equal(t, tt.expected, html)
		})
	}
}
