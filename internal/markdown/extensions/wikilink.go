package extensions

import (
	"github.com/yuin/goldmark"
	gast "github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer"
	"github.com/yuin/goldmark/util"

	"github.com/usememos/memos/internal/markdown/ast"
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
	m.Renderer().AddOptions(
		renderer.WithNodeRenderers(
			util.Prioritized(&wikiLinkHTMLRenderer{}, 100),
		),
	)
}

// wikiLinkHTMLRenderer renders WikiLinkNode back to its literal [[title]] form
// so that server-side HTML rendering (e.g. RSS) keeps the original text.
type wikiLinkHTMLRenderer struct{}

// RegisterFuncs implements renderer.NodeRenderer.
func (*wikiLinkHTMLRenderer) RegisterFuncs(reg renderer.NodeRendererFuncRegisterer) {
	reg.Register(ast.KindWikiLink, func(w util.BufWriter, _ []byte, node gast.Node, entering bool) (gast.WalkStatus, error) {
		if entering {
			n := node.(*ast.WikiLinkNode)
			w.WriteString("[[")
			w.Write(n.Title)
			w.WriteString("]]")
		}
		return gast.WalkContinue, nil
	})
}
