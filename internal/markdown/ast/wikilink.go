package ast

import (
	gast "github.com/yuin/goldmark/ast"
)

// WikiLinkNode represents a [[...]] wiki link in the markdown AST.
type WikiLinkNode struct {
	gast.BaseInline

	// Title is the link target without the surrounding [[ ]].
	Title []byte
}

// KindWikiLink is the NodeKind for WikiLinkNode.
var KindWikiLink = gast.NewNodeKind("WikiLink")

// Kind returns KindWikiLink.
func (*WikiLinkNode) Kind() gast.NodeKind {
	return KindWikiLink
}

// Dump implements Node.Dump for debugging.
func (n *WikiLinkNode) Dump(source []byte, level int) {
	gast.DumpHelper(n, source, level, map[string]string{
		"Title": string(n.Title),
	}, nil)
}
