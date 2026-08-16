package extensions

import (
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/util"

	mparser "github.com/usememos/memos/internal/markdown/parser"
)

type wikiLinkExtension struct{}

// WikiLinkExtension is a goldmark extension for [[...]] wiki link syntax.
var WikiLinkExtension = &wikiLinkExtension{}

// Extend extends the goldmark parser with wiki link support.
func (*wikiLinkExtension) Extend(m goldmark.Markdown) {
	m.Parser().AddOptions(
		parser.WithInlineParsers(
			// Priority 100 - run before the standard link parser (200).
			util.Prioritized(mparser.NewWikiLinkParser(), 100),
		),
	)
}
