package parser

import (
	"bytes"

	gast "github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/text"

	mast "github.com/usememos/memos/internal/markdown/ast"
)

const (
	// MaxWikiLinkLength defines the maximum number of bytes allowed in a wiki link title.
	MaxWikiLinkLength = 512
)

type wikiLinkParser struct{}

// NewWikiLinkParser creates a new inline parser for [[...]] syntax.
func NewWikiLinkParser() parser.InlineParser {
	return &wikiLinkParser{}
}

// Trigger returns the characters that trigger this parser.
func (*wikiLinkParser) Trigger() []byte {
	return []byte{'['}
}

// Parse parses [[title]] syntax. Titles must be non-empty, on a single line,
// and cannot contain nested `[` characters.
//
// Note: a wiki link consumes its entire [[...]] span, so `#tag`/`@user`
// inside a wiki link are NOT extracted as tags or mentions (e.g. [[#tag]]).
func (*wikiLinkParser) Parse(_ gast.Node, block text.Reader, _ parser.Context) gast.Node {
	line, _ := block.PeekLine()
	if len(line) < 2 || line[0] != '[' || line[1] != '[' {
		return nil
	}

	// Find the closing ]] on the same line.
	end := -1
	for i := 2; i < len(line); i++ {
		if line[i] == ']' && i+1 < len(line) && line[i+1] == ']' {
			end = i
			break
		}
		if line[i] == '[' || line[i] == '\n' || line[i] == '\r' {
			return nil
		}
	}
	if end < 0 {
		return nil
	}

	title := bytes.TrimSpace(line[2:end])
	if len(title) == 0 || len(title) > MaxWikiLinkLength {
		return nil
	}

	// Make a copy of the title.
	titleCopy := make([]byte, len(title))
	copy(titleCopy, title)

	// Advance the reader past [[...]].
	block.Advance(end + 2)

	return &mast.WikiLinkNode{
		Title: titleCopy,
	}
}
